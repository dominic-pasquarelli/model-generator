/**
 * Application store (zustand). Holds the local project library, the current
 * canonical project, and all transient designer UI state. All model mutations go
 * through `mutate()`, which bumps the version, marks any prior generation stale,
 * and autosaves — so preview/export always reflect the latest semantic model.
 */
import { create } from "zustand";
import type { Point, Rect } from "@/core/geom";
import { bbox, normalizeRect } from "@/core/geom";
import { boardFrame, boardMmToPxPoint, generationKey, isGenerationCurrent } from "@/core/project/derive";
import { createSeedLibrary } from "@/core/project/fixtures";
import { createProject, parseProjectFile, serializeProject, MgFileError } from "@/core/project/schema";
import type {
  BoardSide,
  CalibrationSourceKind,
  ExportFormat,
  FastenerChoice,
  KeepOut,
  KeepOutShape,
  MountingHole,
  Project,
  SavedBoardDefinition,
} from "@/core/project/types";
import { confirm, isKnown, measured, typeMeasured, unknownVal, type Val } from "@/core/project/value";
import { assessCalibration } from "@/core/units/units";
import type { Unit } from "@/core/units/units";
import type { StepId } from "@/core/validation/validate";
import { blockingErrors, validateProject } from "@/core/validation/validate";
import { mockGenerator } from "@/core/geometry/mockGenerator";
import { solidGenerator } from "@/core/geometry/solidGenerator";
import type { GeometryAdapter } from "@/core/geometry/adapter";
import { buildExport, type ExportArtifact } from "@/core/export/exporter";
import { uid } from "@/lib/id";

// The active geometry adapter — the real self-contained solid generator in production.
// A test seam lets a delayed or mock adapter be injected to exercise generation
// superseding and to isolate store logic from geometry.
let activeGenerator: GeometryAdapter = solidGenerator;
/** @internal test-only: swap the adapter (pass nothing to reset to the mock). */
export function __setGeneratorForTest(gen?: GeometryAdapter) {
  activeGenerator = gen ?? mockGenerator;
}

export type Theme = "light" | "dark";
export type Route = { view: "library" } | { view: "designer"; projectId: string } | { view: "states" };
export type ToolId = "select" | "pan" | "calibrate" | "outline" | "hole" | "keepout";

export type Selection =
  | { kind: "none" }
  | { kind: "hole"; id: string }
  | { kind: "keepout"; id: string }
  | { kind: "calibration" }
  | { kind: "outline" };

export type ExportPhase = "idle" | "progress" | "failed" | "complete";

export interface ExportUiState {
  open: boolean;
  format: ExportFormat;
  writeSidecar: boolean;
  phase: ExportPhase;
  progress: number;
  stage: string;
  artifact: ExportArtifact | null;
  errorCode: string | null;
  errorDetail: string | null;
}

export interface DesignerUi {
  activeStep: StepId;
  activeTool: ToolId;
  selection: Selection;
  zoom: number;
  pan: Point;
  view3d: "iso" | "top" | "front" | "fit";
  autoGenerate: boolean;
  calibrationOpen: boolean;
  /** In-progress calibration anchors placed by clicking on the reference (0, 1 or 2). */
  calibDraft: Point[];
  export: ExportUiState;
}

export const STORAGE_KEY = "mg.projects";
export const RECOVERY_KEY = "mg.projects.recovery";
export const BOARDS_KEY = "mg.boards";
const THEME_KEY = "mg.theme";

export type SaveState = "idle" | "saved" | "error";

const THEME_MEDIA = typeof window !== "undefined" && window.matchMedia;

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  if (THEME_MEDIA && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Preserve corrupt raw storage under a recovery key so it is never silently lost. */
function stashRecovery(raw: string) {
  try {
    // Keep only the latest corrupt snapshot; enough to hand-recover from.
    localStorage.setItem(RECOVERY_KEY, raw);
  } catch {
    /* nothing more we can do */
  }
}

export function loadLibrary(): Project[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return createSeedLibrary();
  }
  // Absent key → genuine first run; seed samples. A present-but-empty array is a
  // deliberately cleared library and is respected (not re-seeded).
  if (raw == null) return createSeedLibrary();
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    // Malformed whole-library JSON: preserve it, then start from seeds rather than
    // overwriting the corrupt data on the next save.
    stashRecovery(raw);
    return createSeedLibrary();
  }
  if (!Array.isArray(arr)) {
    stashRecovery(raw);
    return createSeedLibrary();
  }
  // Parse each project independently: one corrupt entry must not discard the rest.
  // Omitting the top-level schemaVersion lets each project's own version drive migration.
  const out: Project[] = [];
  const dropped: unknown[] = [];
  for (const p of arr) {
    try {
      out.push(parseProjectFile(JSON.stringify({ project: p })).project);
    } catch {
      dropped.push(p); // quarantine the corrupt entry instead of losing it
    }
  }
  if (dropped.length > 0) stashRecovery(JSON.stringify(dropped));
  return out;
}

export interface PersistResult {
  ok: boolean;
  error?: string;
}

function errorName(e: unknown): string {
  // DOMException is not always instanceof Error (e.g. jsdom), so read `name` directly.
  if (e && typeof e === "object" && "name" in e) return String((e as { name: unknown }).name);
  return "StorageError";
}

function persistLibrary(projects: Project[]): PersistResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return { ok: true };
  } catch (e) {
    const name = errorName(e);
    return { ok: false, error: name === "QuotaExceededError" ? "Storage is full" : `Save failed (${name})` };
  }
}

export function loadSavedBoards(): SavedBoardDefinition[] {
  try {
    const raw = localStorage.getItem(BOARDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedBoardDefinition[]) : [];
  } catch {
    return [];
  }
}

function persistSavedBoards(boards: SavedBoardDefinition[]): PersistResult {
  try {
    localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorName(e) };
  }
}

function freshExportUi(): ExportUiState {
  return {
    open: false,
    format: "step",
    writeSidecar: true,
    phase: "idle",
    progress: 0,
    stage: "",
    artifact: null,
    errorCode: null,
    errorDetail: null,
  };
}

function freshDesignerUi(project: Project): DesignerUi {
  return {
    activeStep: firstIncompleteStep(project),
    activeTool: "select",
    selection: { kind: "none" },
    zoom: 1,
    pan: { x: 0, y: 0 },
    view3d: "iso",
    autoGenerate: true,
    calibrationOpen: false,
    calibDraft: [],
    export: freshExportUi(),
  };
}

function firstIncompleteStep(project: Project): StepId {
  if (!project.reference) return "reference";
  if (!project.calibration || project.calibration.status !== "valid") return "calibrate";
  if (!project.board.outline) return "outline";
  if (project.board.holes.length === 0) return "holes";
  return "mount";
}

const TOOL_FOR_STEP: Partial<Record<StepId, ToolId>> = {
  calibrate: "calibrate",
  outline: "outline",
  holes: "hole",
  keepouts: "keepout",
};

let exportTimer: ReturnType<typeof setTimeout> | null = null;
// Monotonic token so a newer generation supersedes an older in-flight one.
let generationSeq = 0;
function stopExportTimer() {
  if (exportTimer) {
    clearTimeout(exportTimer);
    exportTimer = null;
  }
}

/** Bounding box (px) of a keep-out regardless of its current shape. */
function keepOutBBox(k: KeepOut): Rect | null {
  if (k.shape === "rect" && k.rectPx) return k.rectPx;
  if (k.shape === "circle" && k.circlePx)
    return {
      x: k.circlePx.center.x - k.circlePx.radiusPx,
      y: k.circlePx.center.y - k.circlePx.radiusPx,
      w: k.circlePx.radiusPx * 2,
      h: k.circlePx.radiusPx * 2,
    };
  if (k.shape === "polygon" && k.polygonPx && k.polygonPx.length >= 1) return bbox(k.polygonPx);
  return null;
}

/**
 * Change a keep-out's shape AND materialise the corresponding geometry from its
 * current bounding box, clearing the old payload — so the discriminator and the
 * populated field never disagree (which would let validation/generation skip it).
 */
function convertKeepOutShape(k: KeepOut, shape: KeepOutShape) {
  const box = keepOutBBox(k) ?? { x: 0, y: 0, w: 40, h: 24 };
  k.shape = shape;
  delete k.rectPx;
  delete k.circlePx;
  delete k.polygonPx;
  if (shape === "rect") {
    k.rectPx = box;
  } else if (shape === "circle") {
    k.circlePx = { center: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, radiusPx: Math.max(1, Math.min(box.w, box.h) / 2) };
  } else {
    k.polygonPx = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ];
  }
}

/** Board-frame center (or image center) in image-pixel space, for keyboard "+ Add". */
function projectCenterPx(project: Project): Point {
  const outline = project.board.outline;
  if (outline && outline.vertices.length >= 3) {
    const box = bbox(outline.vertices);
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }
  const w = project.reference?.widthPx ?? 1000;
  const h = project.reference?.heightPx ?? 660;
  return { x: w / 2, y: h / 2 };
}

/** Snapshots of the open project for undo/redo. Reset when a different project opens. */
const HISTORY_LIMIT = 60;

export interface AppState {
  theme: Theme;
  route: Route;
  projects: Project[];
  current: Project | null;
  ui: DesignerUi;
  savedBoards: SavedBoardDefinition[];
  /** Past/future project snapshots for undo/redo (current project only). */
  past: Project[];
  future: Project[];
  undo: () => void;
  redo: () => void;
  /** Explicit persistence state — "saved" only after a confirmed successful write. */
  saveState: SaveState;
  lastSavedAt: number | null;
  lastSaveError: string | null;
  /** Live cursor position in image-pixel space (status-bar readout only). */
  cursor: Point | null;
  setCursor: (p: Point | null) => void;

  // theme + nav
  toggleTheme: () => void;
  goLibrary: () => void;
  goStates: () => void;
  openProject: (id: string) => void;
  newProject: (name?: string) => void;

  // designer ui
  setStep: (step: StepId) => void;
  setTool: (tool: ToolId) => void;
  select: (sel: Selection) => void;
  setZoom: (zoom: number) => void;
  nudgeZoom: (delta: number) => void;
  setView3d: (v: DesignerUi["view3d"]) => void;
  toggleAuto: () => void;

  // model
  setUnits: (u: Unit) => void;
  setBoardName: (name: string) => void;
  setBoardRevision: (rev: string) => void;
  setThicknessMm: (mm: number | null) => void;
  addSampleReference: () => void;
  importReference: (ref: ReferenceInput) => PersistResult;
  markReferenceMissing: (missing: boolean) => void;
  beginCalibration: () => void;
  placeCalibAnchor: (p: Point) => void;
  openCalibration: () => void;
  closeCalibration: () => void;
  applyCalibration: (knownMm: number, source: CalibrationSourceKind) => { ok: boolean; message?: string };
  setSampleOutline: () => void;
  setOutlineRect: (a: Point, b: Point) => void;
  addHoleAt: (centerImg: Point) => void;
  addHoleAtCenter: () => void;
  addKeepOutCenter: () => void;
  updateHole: (id: string, patch: Partial<Pick<MountingHole, "fastener" | "state">> & { diameterMm?: number | null; center?: Point }) => void;
  confirmHole: (id: string) => void;
  deleteHole: (id: string) => void;
  addKeepOutRect: (a: Point, b: Point) => void;
  updateKeepOut: (id: string, patch: Partial<Pick<KeepOut, "purpose" | "boardSide" | "shape" | "state">> & { clearanceHeightMm?: number | null }) => void;
  deleteKeepOut: (id: string) => void;
  setMountField: (patch: Partial<MountPatch>) => void;

  // generation + export
  generate: () => Promise<void>;
  ensureGenerated: () => void;
  openExport: () => void;
  closeExport: () => void;
  setExportFormat: (f: ExportFormat) => void;
  toggleSidecar: () => void;
  runExport: () => void;
  cancelExport: () => void;
  retryExport: () => void;
  /** Record the export in history — ONLY after the browser download is initiated. */
  commitExportDownload: () => void;

  // persistence
  saveBoardToLibrary: () => PersistResult;
  /** Serialise and download the open (or given) project as a portable .mgproj file. */
  downloadProjectFile: (id?: string) => void;
  /** Parse a .mgproj file's text, add it to the library (fresh id on collision), open it. */
  importProjectFile: (text: string) => ImportResult;
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export interface ReferenceInput {
  assetName: string;
  src: string;
  widthPx: number;
  heightPx: number;
  rotationDeg?: number;
  captureLabel?: string;
}

export interface MountPatch {
  kind: Project["mount"]["kind"];
  standoffHeightMm: number | null;
  baseThicknessMm: number | null;
  bossDiameterMm: number | null;
  clearanceMm: number | null;
  fastener: FastenerChoice;
  fastenerStyle: Project["mount"]["fastenerStyle"];
  sideTabs: 0 | 2 | 4;
  tolerance: Project["mount"]["tolerance"];
}

function valFromInput(mm: number | null, prev: Val<number>): Val<number> {
  if (mm == null || !Number.isFinite(mm)) return unknownVal<number>();
  // Typing a value is a measured/confirmed act — upgrade Inferred/Unknown → Measured.
  return typeMeasured(mm, isKnown(prev) ? prev.note : undefined);
}

export const useStore = create<AppState>((set, get) => {
  const theme = loadTheme();
  applyTheme(theme);
  const projects = loadLibrary();
  const savedBoards = loadSavedBoards();

  /** Persist and set an explicit save state. "saved" only follows a confirmed write. */
  function commit(projectsNext: Project[], patch: Partial<AppState> = {}) {
    const res = persistLibrary(projectsNext);
    set({
      projects: projectsNext,
      ...patch,
      saveState: res.ok ? "saved" : "error",
      lastSaveError: res.ok ? null : res.error ?? "Save failed",
      ...(res.ok ? { lastSavedAt: Date.now() } : {}),
    } as Partial<AppState>);
    return res;
  }

  /** Commit a model change: clone, mutate, bump version, autosave. Freshness of any
   *  prior generation is recomputed from the model (its key), never a stored flag. */
  function mutate(mutator: (p: Project) => void): PersistResult {
    const current = get().current;
    if (!current) return { ok: false, error: "No open project" };
    const snapshot = structuredClone(current) as Project;
    const next = structuredClone(current) as Project;
    mutator(next);
    next.version += 1;
    next.updatedAt = Date.now();
    const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
    // Record the pre-edit snapshot for undo; a fresh edit clears the redo stack.
    const pastNext = [...get().past, snapshot].slice(-HISTORY_LIMIT);
    const res = commit(projectsNext, { current: next, past: pastNext, future: [] });
    if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    return res;
  }

  function nextLabel(prefix: string, existing: { label: string }[]): string {
    let n = existing.length + 1;
    const has = (l: string) => existing.some((e) => e.label === l);
    while (has(`${prefix}${n}`)) n += 1;
    return `${prefix}${n}`;
  }

  function nextKeepOutLabel(existing: { label: string }[]): string {
    let n = existing.length + 1;
    const has = (l: string) => existing.some((e) => e.label === l);
    while (has(`KO-${n}`)) n += 1;
    return `KO-${n}`;
  }

  return {
    theme,
    route: { view: "library" },
    projects,
    current: null,
    ui: freshDesignerUi(createProject()),
    savedBoards,
    past: [],
    future: [],
    saveState: "idle",
    lastSavedAt: null,
    lastSaveError: null,
    cursor: null,
    setCursor: (p) => set({ cursor: p }),

    undo: () => {
      const past = get().past;
      const current = get().current;
      if (past.length === 0 || !current) return;
      const prev = past[past.length - 1];
      const futureNext = [...get().future, structuredClone(current) as Project].slice(-HISTORY_LIMIT);
      const projectsNext = get().projects.map((p) => (p.id === prev.id ? prev : p));
      commit(projectsNext, { current: prev, past: past.slice(0, -1), future: futureNext });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    },
    redo: () => {
      const future = get().future;
      const current = get().current;
      if (future.length === 0 || !current) return;
      const nextState = future[future.length - 1];
      const pastNext = [...get().past, structuredClone(current) as Project].slice(-HISTORY_LIMIT);
      const projectsNext = get().projects.map((p) => (p.id === nextState.id ? nextState : p));
      commit(projectsNext, { current: nextState, past: pastNext, future: future.slice(0, -1) });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    },

    toggleTheme: () => {
      const t: Theme = get().theme === "dark" ? "light" : "dark";
      applyTheme(t);
      set({ theme: t });
    },

    goLibrary: () => {
      stopExportTimer();
      set({ route: { view: "library" } });
    },
    goStates: () => {
      stopExportTimer();
      set({ route: { view: "states" } });
    },

    openProject: (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      stopExportTimer();
      set({ current: project, route: { view: "designer", projectId: id }, ui: freshDesignerUi(project), past: [], future: [] });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    },

    newProject: (name) => {
      stopExportTimer();
      const project = createProject({ name });
      const projectsNext = [project, ...get().projects];
      commit(projectsNext, {
        current: project,
        route: { view: "designer", projectId: project.id },
        ui: freshDesignerUi(project),
        past: [],
        future: [],
      });
    },

    setStep: (step) => {
      set((s) => ({ ui: { ...s.ui, activeStep: step, activeTool: TOOL_FOR_STEP[step] ?? "select" } }));
      if (step === "mount" || step === "export") get().ensureGenerated();
    },
    setTool: (tool) => set((s) => ({ ui: { ...s.ui, activeTool: tool } })),
    select: (selection) => set((s) => ({ ui: { ...s.ui, selection } })),
    setZoom: (zoom) => set((s) => ({ ui: { ...s.ui, zoom: Math.min(4, Math.max(0.2, zoom)) } })),
    nudgeZoom: (delta) => get().setZoom(get().ui.zoom + delta),
    setView3d: (view3d) => set((s) => ({ ui: { ...s.ui, view3d } })),
    toggleAuto: () => set((s) => ({ ui: { ...s.ui, autoGenerate: !s.ui.autoGenerate } })),

    setUnits: (units) => mutate((p) => void (p.units = units)),
    setBoardName: (name) => mutate((p) => void (p.board.name = name)),
    setBoardRevision: (rev) => mutate((p) => void (p.board.revision = rev)),
    setThicknessMm: (mm) => mutate((p) => void (p.board.thicknessMm = valFromInput(mm, p.board.thicknessMm))),

    addSampleReference: () =>
      mutate((p) => {
        p.reference = {
          id: uid("ref"),
          assetName: "mg-dev-01_top.jpg",
          src: "/board-photo.svg",
          widthPx: 1000,
          heightPx: 660,
          rotationDeg: -2,
          capture: { label: "Photo — sample board, roughly top-down", kind: "photo" },
          addedAt: Date.now(),
        };
      }),

    importReference: (ref) =>
      mutate((p) => {
        p.reference = {
          id: uid("ref"),
          assetName: ref.assetName,
          src: ref.src,
          widthPx: ref.widthPx,
          heightPx: ref.heightPx,
          rotationDeg: ref.rotationDeg ?? 0,
          capture: { label: ref.captureLabel ?? "Uploaded image — kept local", kind: "photo" },
          addedAt: Date.now(),
        };
        // A new reference invalidates any calibration measured against the old image.
        p.calibration = null;
      }),

    markReferenceMissing: (missing) =>
      mutate((p) => {
        if (p.reference) p.reference.missing = missing;
      }),

    beginCalibration: () =>
      set((s) => ({ ui: { ...s.ui, activeTool: "calibrate", calibDraft: [], calibrationOpen: false } })),

    placeCalibAnchor: (pt) =>
      set((s) => {
        const draft = s.ui.calibDraft.length >= 2 ? [pt] : [...s.ui.calibDraft, pt];
        // Two anchors placed → open the popover to enter the known distance.
        return { ui: { ...s.ui, calibDraft: draft, calibrationOpen: draft.length === 2 } };
      }),

    // Editing an existing calibration seeds the draft from its anchors; a reference with
    // no calibration must have its two endpoints placed on the image first.
    openCalibration: () =>
      set((s) => {
        const anchors = s.current?.calibration?.anchors;
        if (anchors) return { ui: { ...s.ui, calibrationOpen: true, activeTool: "calibrate", calibDraft: [...anchors] } };
        return { ui: { ...s.ui, activeTool: "calibrate", calibDraft: [], calibrationOpen: false } };
      }),
    closeCalibration: () => set((s) => ({ ui: { ...s.ui, calibrationOpen: false } })),

    applyCalibration: (knownMm, source) => {
      const current = get().current;
      if (!current || !current.reference) return { ok: false, message: "No reference image." };
      const draft = get().ui.calibDraft;
      if (draft.length < 2) return { ok: false, message: "Place both calibration endpoints on the image first." };
      const anchors: [Point, Point] = [draft[0], draft[1]];
      const existing = current.calibration;

      // Anchors must be finite and inside the reference-image bounds — millimetres come
      // only from trusted endpoints, so out-of-bounds or non-finite points are rejected.
      const w = current.reference.widthPx;
      const h = current.reference.heightPx;
      const inBounds = (pt: Point) =>
        Number.isFinite(pt.x) && Number.isFinite(pt.y) && pt.x >= 0 && pt.y >= 0 && pt.x <= w && pt.y <= h;
      if (!inBounds(anchors[0]) || !inBounds(anchors[1])) {
        return { ok: false, message: "A calibration endpoint is outside the image. Place both anchors on the board." };
      }

      const assessment = assessCalibration(anchors[0], anchors[1], knownMm);
      if (!assessment.valid) {
        // Keep a prior *valid* calibration untouched; only record a fresh rejection.
        if (!(existing && existing.status === "valid")) {
          mutate((p) => {
            p.calibration = {
              id: existing?.id ?? uid("cal"),
              anchors,
              knownMm: measured(knownMm, source),
              source,
              pxPerMm: null,
              status: "invalid",
              ...(assessment.reason ? { rejectReason: assessment.reason } : {}),
              ...(assessment.message ? { rejectMessage: assessment.message } : {}),
              createdAt: Date.now(),
            };
          });
        }
        return { ok: false, ...(assessment.message ? { message: assessment.message } : {}) };
      }
      mutate((p) => {
        p.calibration = {
          id: existing?.id ?? uid("cal"),
          anchors,
          knownMm: measured(knownMm, source),
          source,
          pxPerMm: assessment.pxPerMm,
          status: "valid",
          createdAt: Date.now(),
        };
      });
      set((s) => ({ ui: { ...s.ui, calibrationOpen: false } }));
      return { ok: true };
    },

    setSampleOutline: () =>
      mutate((p) => {
        p.board.outline = {
          vertices: [
            { x: 75, y: 50 },
            { x: 925, y: 50 },
            { x: 925, y: 610 },
            { x: 75, y: 610 },
          ],
          cornerRadiusMm: measured(2.4),
          confirmed: true,
        };
      }),

    setOutlineRect: (a, b) =>
      mutate((p) => {
        const r = normalizeRect(a, b);
        p.board.outline = {
          vertices: [
            { x: r.x, y: r.y },
            { x: r.x + r.w, y: r.y },
            { x: r.x + r.w, y: r.y + r.h },
            { x: r.x, y: r.y + r.h },
          ],
          cornerRadiusMm: p.board.outline?.cornerRadiusMm ?? unknownVal<number>(),
          confirmed: true,
        };
      }),

    addHoleAt: (centerImg) => {
      mutate((p) => {
        const label = nextLabel("H", p.board.holes);
        p.board.holes.push({
          id: uid("hole"),
          label,
          centerPx: centerImg,
          diameterMm: unknownVal<number>(),
          fastener: "M3",
          positionSource: p.calibration?.status === "valid" ? "clicked-calibrated" : "typed",
          state: "measured",
        });
      });
      const created = get().current?.board.holes.at(-1);
      if (created) get().select({ kind: "hole", id: created.id });
    },

    addHoleAtCenter: () => {
      const p = get().current;
      if (!p) return;
      get().addHoleAt(projectCenterPx(p));
    },

    addKeepOutCenter: () => {
      const p = get().current;
      if (!p) return;
      const c = projectCenterPx(p);
      const w = (p.reference?.widthPx ?? 1000) * 0.12;
      const h = w * 0.55;
      get().addKeepOutRect({ x: c.x - w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y + h / 2 });
    },

    updateHole: (id, patch) =>
      mutate((p) => {
        const h = p.board.holes.find((x) => x.id === id);
        if (!h) return;
        if ("diameterMm" in patch) h.diameterMm = valFromInput(patch.diameterMm ?? null, h.diameterMm);
        if (patch.fastener) h.fastener = patch.fastener;
        if (patch.state) h.state = patch.state;
        if (patch.center) {
          h.centerPx = patch.center;
          h.positionSource = "typed";
        }
      }),

    confirmHole: (id) =>
      mutate((p) => {
        const h = p.board.holes.find((x) => x.id === id);
        if (!h) return;
        if (isKnown(h.diameterMm)) {
          h.diameterMm = confirm(h.diameterMm) as typeof h.diameterMm;
          h.state = "confirmed";
        }
      }),

    deleteHole: (id) => {
      mutate((p) => void (p.board.holes = p.board.holes.filter((h) => h.id !== id)));
      const sel = get().ui.selection;
      if (sel.kind === "hole" && sel.id === id) get().select({ kind: "none" });
    },

    addKeepOutRect: (a, b) => {
      mutate((p) => {
        p.board.keepOuts.push({
          id: uid("ko"),
          label: nextKeepOutLabel(p.board.keepOuts),
          purpose: "Clearance",
          shape: "rect",
          boardSide: "top",
          rectPx: normalizeRect(a, b),
          clearanceHeightMm: unknownVal<number>(),
          state: "measured",
        });
      });
      const created = get().current?.board.keepOuts.at(-1);
      if (created) get().select({ kind: "keepout", id: created.id });
    },

    updateKeepOut: (id, patch) =>
      mutate((p) => {
        const k = p.board.keepOuts.find((x) => x.id === id);
        if (!k) return;
        if (patch.purpose !== undefined) k.purpose = patch.purpose;
        if (patch.boardSide) k.boardSide = patch.boardSide as BoardSide;
        if (patch.shape && patch.shape !== k.shape) convertKeepOutShape(k, patch.shape as KeepOutShape);
        if (patch.state) k.state = patch.state;
        if ("clearanceHeightMm" in patch)
          k.clearanceHeightMm = valFromInput(patch.clearanceHeightMm ?? null, k.clearanceHeightMm);
      }),

    deleteKeepOut: (id) => {
      mutate((p) => void (p.board.keepOuts = p.board.keepOuts.filter((k) => k.id !== id)));
      const sel = get().ui.selection;
      if (sel.kind === "keepout" && sel.id === id) get().select({ kind: "none" });
    },

    setMountField: (patch) =>
      mutate((p) => {
        const m = p.mount;
        if (patch.kind) m.kind = patch.kind;
        if (patch.fastener) m.fastener = patch.fastener;
        if (patch.fastenerStyle) m.fastenerStyle = patch.fastenerStyle;
        if (patch.sideTabs !== undefined) m.sideTabs = patch.sideTabs;
        if (patch.tolerance) m.tolerance = patch.tolerance;
        if ("standoffHeightMm" in patch) m.standoffHeightMm = valFromInput(patch.standoffHeightMm ?? null, m.standoffHeightMm);
        if ("baseThicknessMm" in patch) m.baseThicknessMm = valFromInput(patch.baseThicknessMm ?? null, m.baseThicknessMm);
        if ("bossDiameterMm" in patch) m.bossDiameterMm = valFromInput(patch.bossDiameterMm ?? null, m.bossDiameterMm);
        if ("clearanceMm" in patch) m.clearanceMm = valFromInput(patch.clearanceMm ?? null, m.clearanceMm);
      }),

    generate: async () => {
      const current = get().current;
      if (!current) return;
      const seq = ++generationSeq;
      const result = await activeGenerator.generate(current);
      // Superseded by a newer generation, or the user switched projects → discard.
      if (seq !== generationSeq) return;
      const latest = get().current;
      if (!latest || latest.id !== current.id) return;
      if (!result.ok) return;
      // Accept the result ONLY if the current model still hashes to what was generated.
      // An edit made during the (async) adapter run changes the key → the stale result
      // is discarded and cannot become the project's generation.
      if (generationKey(latest) !== result.model.key) return;
      const next = { ...latest, generated: result.model };
      const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
      commit(projectsNext, { current: next });
    },

    ensureGenerated: () => {
      const current = get().current;
      if (!current) return;
      // "Can generate" ignores the freshness blocker itself; regenerate whenever the
      // stored generation is not current for the present model.
      const blockingExceptStale = blockingErrors(validateProject(current)).filter((b) => b.id !== "generation-stale");
      const canGenerate = blockingExceptStale.length === 0 && !!boardFrame(current) && current.board.holes.length > 0;
      if (canGenerate && !isGenerationCurrent(current)) void get().generate();
    },

    openExport: () => {
      get().ensureGenerated();
      set((s) => ({ ui: { ...s.ui, activeStep: "export", export: { ...freshExportUi(), open: true } } }));
    },
    closeExport: () => {
      stopExportTimer();
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, open: false, phase: "idle", progress: 0 } } }));
    },
    setExportFormat: (format) => set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, format } } })),
    toggleSidecar: () => set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, writeSidecar: !s.ui.export.writeSidecar } } })),

    runExport: () => {
      const current = get().current;
      if (!current) return;
      const projectId = current.id; // finalize must apply to THIS project, not whatever is current later
      // Honest stages reflecting real work: build the solid, serialise the body, sidecar.
      const stages = ["Building solid from the canonical model", `Serialising ${get().ui.export.format.toUpperCase()} body`];
      if (get().ui.export.writeSidecar) stages.push("Writing metadata sidecar");
      let i = 0;
      stopExportTimer();
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "progress", progress: 4, stage: stages[0] } } }));
      const tick = () => {
        // Abort if the user navigated to a different project mid-export.
        const active = get().current;
        if (!active || active.id !== projectId) {
          stopExportTimer();
          return;
        }
        i += 1;
        const progress = Math.min(96, Math.round((i / (stages.length + 1)) * 100));
        set((s) => ({
          ui: { ...s.ui, export: { ...s.ui.export, progress, stage: stages[Math.min(i, stages.length - 1)] } },
        }));
        if (i < stages.length) {
          exportTimer = setTimeout(tick, 380);
          return;
        }
        // Finalize: prepare the artifact IN MEMORY only. No ExportRecord is written to
        // project history until the user actually downloads (see commitExportDownload).
        const opts = { format: get().ui.export.format, writeSidecar: get().ui.export.writeSidecar };
        const built = buildExport(active, opts);
        if (!built.ok) {
          set((s) => ({
            ui: {
              ...s.ui,
              export: {
                ...s.ui.export,
                phase: "failed",
                errorCode: "EXPORT_NOT_READY",
                errorDetail: built.readiness.blockers.map((b) => b.title).join(" · ") || "Readiness gate failed.",
              },
            },
          }));
          return;
        }
        set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "complete", progress: 100, artifact: built.artifact } } }));
      };
      exportTimer = setTimeout(tick, 380);
    },

    commitExportDownload: () => {
      const art = get().ui.export.artifact;
      const current = get().current;
      if (!art || !current) return;
      if (current.exports.some((e) => e.id === art.record.id)) return; // already recorded
      const next = { ...current, exports: [art.record, ...current.exports] };
      const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
      commit(projectsNext, { current: next });
    },

    cancelExport: () => {
      stopExportTimer();
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "idle", progress: 0, stage: "" } } }));
    },
    retryExport: () =>
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "idle", progress: 0, errorCode: null, errorDetail: null } } })),

    saveBoardToLibrary: () => {
      const current = get().current;
      if (!current) return { ok: false, error: "No open project" };
      const def: SavedBoardDefinition = {
        id: uid("bdef"),
        name: current.board.name || current.name,
        revision: current.board.revision,
        savedAt: Date.now(),
        board: structuredClone(current.board),
        calibration: current.calibration ? structuredClone(current.calibration) : null,
      };
      const boardsNext = [def, ...get().savedBoards];
      const res = persistSavedBoards(boardsNext);
      set({ savedBoards: boardsNext });
      return res;
    },

    downloadProjectFile: (id) => {
      const project = id ? get().projects.find((p) => p.id === id) : get().current;
      if (!project) return;
      const safe = project.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "project";
      downloadTextFile(`${safe}_v${project.version}.mgproj`, serializeProject(project), "application/json");
    },

    importProjectFile: (text) => {
      let project: Project;
      try {
        project = parseProjectFile(text).project;
      } catch (e) {
        const msg =
          e instanceof MgFileError
            ? `${e.code}: ${e.message}`
            : "This file could not be read as a Model Generator project.";
        return { ok: false, error: msg };
      }
      // Import is always additive: a colliding id gets a fresh one so nothing is clobbered.
      if (get().projects.some((p) => p.id === project.id)) project = { ...project, id: uid("proj") };
      const projectsNext = [project, ...get().projects];
      const res = commit(projectsNext, {
        current: project,
        route: { view: "designer", projectId: project.id },
        ui: freshDesignerUi(project),
        past: [],
        future: [],
      });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
      return { ok: res.ok, ...(res.ok ? {} : { error: res.error }), id: project.id };
    },
  };
});

/** Trigger a browser download of a text file (Blob + object URL). */
export function downloadTextFile(name: string, text: string, type = "text/plain") {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convert a board-mm point to image-pixel space using the current project frame. */
export function boardMmToImage(project: Project, mm: Point): Point | null {
  const frame = boardFrame(project);
  if (!frame) return null;
  return boardMmToPxPoint(mm, frame);
}

/** Trigger a browser download of an export artifact (real for the sidecar). */
export function downloadArtifact(artifact: ExportArtifact) {
  if (typeof document === "undefined") return;
  const files: Array<{ name: string; text: string; type: string }> = [
    { name: artifact.fileName, text: artifact.body, type: "application/octet-stream" },
  ];
  if (artifact.sidecar) {
    files.push({
      name: artifact.fileName.replace(/\.(step|stl)$/, ".meta.json"),
      text: artifact.sidecar,
      type: "application/json",
    });
  }
  for (const f of files) {
    const blob = new Blob([f.text], { type: f.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
