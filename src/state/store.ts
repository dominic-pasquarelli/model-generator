/**
 * Application store (zustand). Holds the local project library, the current
 * canonical project, and all transient designer UI state. All model mutations go
 * through `mutate()`, which bumps the version, marks any prior generation stale,
 * and autosaves — so preview/export always reflect the latest semantic model.
 */
import { create } from "zustand";
import type { Point, Rect } from "@/core/geom";
import { bbox, normalizeRect } from "@/core/geom";
import { boardFrame, boardMmToPxPoint, generationKey, inferredFabricationDims, isGenerationCurrent } from "@/core/project/derive";
import { createSeedLibrary } from "@/core/project/fixtures";
import { createProject, parseProjectFile, projectRoundTrips, serializeProject, MgFileError, MAX_HOLES, MAX_KEEPOUTS, MAX_EXPORTS, MAX_STRING } from "@/core/project/schema";
import type {
  BoardSide,
  CalibrationSourceKind,
  ExportFormat,
  FastenerChoice,
  FastenerStyle,
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
import { requestBuild, __setBuildForTest, type BuildFn } from "@/core/geometry/buildClient";
import type { MeshResult } from "@/core/geometry/mesh";
import { requestExport } from "@/core/export/exportClient";
import { type ExportArtifact } from "@/core/export/exporter";
import type { GeneratedModel } from "@/core/project/types";
import { uid } from "@/lib/id";

/**
 * ONE worker-owned geometry build per generation key (reviewer #1). The store drives the build
 * worker and caches the immutable result here; preview, validation, and export all read this
 * cache instead of each recomputing the mesh synchronously on the main thread. A small bounded
 * LRU keeps a few recent keys so undo/redo and quick edits reuse prior builds. Because the key
 * is a content hash of the geometry-affecting model, a cached result is never stale — it is,
 * by construction, the build of exactly that model.
 */
const BUILD_CACHE_LIMIT = 8;
/** In-flight builds keyed by generation key; the controller hard-cancels the worker on abort. */
const buildInflight = new Map<string, { controller: AbortController; promise: Promise<MeshResult> }>();
/** Wall-clock build time (ms) per key, for the recorded generation's honest duration readout. */
const buildElapsed = new Map<string, number>();

function nowMs(): number {
  const g = globalThis as { performance?: { now?: () => number } };
  return g.performance?.now ? g.performance.now() : Date.now();
}

function cacheSet(builds: Record<string, MeshResult>, key: string, result: MeshResult): Record<string, MeshResult> {
  const next: Record<string, MeshResult> = { ...builds, [key]: result };
  const keys = Object.keys(next);
  if (keys.length > BUILD_CACHE_LIMIT) delete next[keys[0]]; // evict oldest inserted
  return next;
}

/**
 * @internal test-only: inject a build implementation (pass nothing to reset to the worker).
 * Swapping the generator invalidates every cached build (they were produced by the old one),
 * so the cache + in-flight builds are cleared — a later request re-runs against the new impl.
 */
export function __setGeneratorForTest(fn?: BuildFn) {
  __setBuildForTest(fn);
  buildInflight.forEach((v) => v.controller.abort());
  buildInflight.clear();
  buildElapsed.clear();
  try {
    useStore.setState({ builds: {} });
  } catch {
    /* store not constructed yet */
  }
}

/**
 * Download proof (reviewer #6). Writing a file to disk is a side effect the store cannot verify
 * itself, so it goes through a typed adapter that REPORTS whether the download initiated. The
 * export is recorded in history ONLY on a confirmed initiation — history can never claim a
 * download that never happened — and the adapter is injectable so the ledger logic is testable
 * without a real browser download.
 */
export interface DownloadFile {
  name: string;
  text: string;
  type: string;
}
export type DownloadResult = { initiated: true; fileNames: string[] } | { initiated: false; reason: string };
export type DownloadAdapter = (files: DownloadFile[]) => DownloadResult;

/** The real browser download: a Blob + object URL per file, reporting genuine initiation. */
const browserDownload: DownloadAdapter = (files) => {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return { initiated: false, reason: "Downloads are unavailable in this environment." };
  }
  try {
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
    return { initiated: true, fileNames: files.map((f) => f.name) };
  } catch (e) {
    return { initiated: false, reason: e instanceof Error ? e.message : "The browser blocked the download." };
  }
};
let downloadAdapter: DownloadAdapter = browserDownload;
/** @internal test-only: inject a download adapter (pass nothing to reset to the browser one). */
export function __setDownloadAdapterForTest(fn?: DownloadAdapter) {
  downloadAdapter = fn ?? browserDownload;
}

/** The files a prepared artifact writes: the body, plus the sidecar when one was written. */
function artifactFiles(artifact: ExportArtifact): DownloadFile[] {
  const files: DownloadFile[] = [{ name: artifact.fileName, text: artifact.body, type: "application/octet-stream" }];
  if (artifact.sidecar) {
    files.push({ name: artifact.fileName.replace(/\.(step|stl)$/, ".meta.json"), text: artifact.sidecar, type: "application/json" });
  }
  return files;
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
  /** The user has acknowledged the inferred fabrication dimensions (reviewer #5C). Required
   *  before export whenever any exported dimension is inferred rather than measured. */
  acknowledgedInferred: boolean;
  phase: ExportPhase;
  progress: number;
  stage: string;
  artifact: ExportArtifact | null;
  errorCode: string | null;
  errorDetail: string | null;
  /** Set when a prepared artifact's download did NOT initiate (reviewer #6): the artifact stays
   *  prepared and NO export is recorded, so history never claims a download that never happened. */
  downloadError: string | null;
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
    acknowledgedInferred: false,
    phase: "idle",
    progress: 0,
    stage: "",
    artifact: null,
    errorCode: null,
    errorDetail: null,
    downloadError: null,
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
// Cancellation handle + monotonic token for the in-flight EXPORT job. Aborting terminates the
// export worker mid-serialization (a real hard-cancel); the token discards a superseded job's
// late result. Geometry-build cancellation is handled separately by `buildInflight` (reviewer #1).
let exportAbort: AbortController | null = null;
let exportSeq = 0;

// Strictly-increasing edit timestamp so the revision chronology is always ordered, even for
// rapid successive transitions (Date.now() can repeat within a millisecond). Anchored on the
// current project's `updatedAt` too (reviewer #4): after importing a future-dated project, the
// next edit's timestamp can never precede the imported value.
let lastStamp = 0;
function editStamp(anchor = 0): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1, anchor + 1);
  return lastStamp;
}
/**
 * Advance the monotonic version counter with an explicit overflow guard (reviewer #4). Beyond
 * Number.MAX_SAFE_INTEGER `v + 1 === v`, which would stall the counter and let two distinct
 * states share an export filename. Import validation rejects unsafe versions, so this can only
 * fire on a genuinely corrupt in-memory state — fail loudly rather than silently duplicate.
 */
function bumpVersion(v: number): number {
  const n = v + 1;
  if (!Number.isSafeInteger(n) || n <= v) throw new Error("Project version overflow — cannot advance the monotonic version counter.");
  return n;
}

/**
 * An undo/redo snapshot of the EDITABLE semantic state only. `exports` is an append-only
 * audit ledger, not editable design state, so it is excluded here and re-attached from the
 * live project on restore (reviewer #4) — undoing a design edit must never delete a
 * completed export record.
 */
function semanticSnapshot(project: Project): Project {
  return { ...(structuredClone(project) as Project), exports: [] };
}

/**
 * Restore a semantic snapshot as a NEW forward transition: keep the live append-only export
 * ledger, and stamp a strictly-increasing version + timestamp so `version` stays a monotonic
 * edit counter and two distinct states can never share an export filename. Generation
 * freshness is recomputed from the restored model's key, never trusted from a stored flag.
 */
function restoreSemantic(snap: Project, current: Project): Project {
  return { ...(structuredClone(snap) as Project), exports: structuredClone(current.exports), version: bumpVersion(current.version), updatedAt: editStamp(current.updatedAt) };
}
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
  updateHole: (id: string, patch: Partial<Pick<MountingHole, "fastener" | "fastenerStyle" | "state">> & { diameterMm?: number | null; boreDiameterMm?: number | null; center?: Point }) => void;
  confirmHole: (id: string) => void;
  deleteHole: (id: string) => void;
  addKeepOutRect: (a: Point, b: Point) => void;
  updateKeepOut: (id: string, patch: Partial<Pick<KeepOut, "purpose" | "boardSide" | "shape" | "state">> & { clearanceHeightMm?: number | null }) => void;
  deleteKeepOut: (id: string) => void;
  setMountField: (patch: Partial<MountPatch>) => void;

  /** Coded failure from the last generation attempt, keyed by the model key it was computed
   *  for; null when the last attempt succeeded or none has run. A known geometry failure is
   *  recorded here rather than silently discarded (reviewer #2) — validateProject also surfaces
   *  the same coded diagnostic deterministically for the preview/export/report. */
  generationError: { key: string; code: string; message: string; feature?: string } | null;

  /** Worker-owned geometry build cache keyed by generation key (reviewer #1). Preview,
   *  validation, and export all read the SAME build here rather than recomputing the mesh. */
  builds: Record<string, MeshResult>;

  // generation + export
  generate: () => Promise<void>;
  /** Request a worker build of the current model into the cache (for preview/export of a draft). */
  ensureBuild: () => void;
  /** Hard-cancel any in-flight generation/build (terminates the geometry worker). */
  cancelGenerate: () => void;
  ensureGenerated: () => void;
  openExport: () => void;
  closeExport: () => void;
  setExportFormat: (f: ExportFormat) => void;
  toggleSidecar: () => void;
  /** Toggle the user's acknowledgement of inferred fabrication dimensions (reviewer #5C). */
  toggleAckInferred: () => void;
  runExport: () => void;
  cancelExport: () => void;
  retryExport: () => void;
  /** Download the prepared artifact and record it in history — the record is written ONLY on a
   *  confirmed download initiation (reviewer #6). Returns the typed download result. */
  commitExportDownload: () => DownloadResult;

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
  /** Fastener + install style seeded onto NEW holes (a default, not the cut authority). */
  defaultFastener: FastenerChoice;
  defaultFastenerStyle: FastenerStyle;
  sideTabs: 0 | 2 | 4;
  tolerance: Project["mount"]["tolerance"];
  /** Explicit custom fit offset (mm); consumed only when tolerance is "custom". */
  customToleranceMm: number | null;
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
    const snapshot = semanticSnapshot(current);
    const next = structuredClone(current) as Project;
    mutator(next);
    next.version = bumpVersion(current.version);
    next.updatedAt = editStamp(current.updatedAt);
    const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
    // Record the pre-edit SEMANTIC snapshot for undo; a fresh edit clears the redo stack.
    const pastNext = [...get().past, snapshot].slice(-HISTORY_LIMIT);
    const res = commit(projectsNext, { current: next, past: pastNext, future: [] });
    if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    return res;
  }

  /**
   * Kick (or reuse) ONE off-thread geometry build for `key` and cache the immutable result
   * (reviewer #1). Deduplicates by key so preview, validation, and generation never race two
   * builds of the same model; a newer wanted key hard-cancels older in-flight builds
   * (terminates the worker). Returns the settled result (ABORTED when cancelled). Both the
   * success and the coded FAILURE are cached so the preview/validation can render the real
   * reason; only ABORTED is not cached. The key is a content hash, so a cache hit is never stale.
   */
  function runBuild(key: string, project: Project): Promise<MeshResult> {
    const cached = get().builds[key];
    if (cached) return Promise.resolve(cached);
    const existing = buildInflight.get(key);
    if (existing) return existing.promise;
    // A newer wanted key supersedes older in-flight builds — hard-cancel them.
    for (const [k, v] of buildInflight) {
      if (k !== key) {
        v.controller.abort();
        buildInflight.delete(k);
      }
    }
    const controller = new AbortController();
    const started = nowMs();
    const promise = requestBuild(project, controller.signal).then((result) => {
      if (buildInflight.get(key)?.controller === controller) buildInflight.delete(key);
      const aborted = (result.ok === false && result.error.code === "ABORTED") || controller.signal.aborted;
      if (!aborted) {
        buildElapsed.set(key, Math.round((nowMs() - started) * 100) / 100);
        set((s) => ({ builds: cacheSet(s.builds, key, result) }));
      }
      return result;
    });
    buildInflight.set(key, { controller, promise });
    return promise;
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
    generationError: null,
    builds: {},
    cursor: null,
    setCursor: (p) => set({ cursor: p }),

    // Undo/redo are NEW forward document transitions that restore an earlier SEMANTIC state
    // (see restoreSemantic): the append-only `exports` ledger is preserved across both, and
    // `version` stays a strictly-increasing monotonic counter.
    undo: () => {
      const { past, future, current, projects } = get();
      if (past.length === 0 || !current) return;
      const restored = restoreSemantic(past[past.length - 1], current);
      const futureNext = [...future, semanticSnapshot(current)].slice(-HISTORY_LIMIT);
      commit(projects.map((p) => (p.id === restored.id ? restored : p)), { current: restored, past: past.slice(0, -1), future: futureNext });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    },
    redo: () => {
      const { past, future, current, projects } = get();
      if (future.length === 0 || !current) return;
      const restored = restoreSemantic(future[future.length - 1], current);
      const pastNext = [...past, semanticSnapshot(current)].slice(-HISTORY_LIMIT);
      commit(projects.map((p) => (p.id === restored.id ? restored : p)), { current: restored, past: pastNext, future: future.slice(0, -1) });
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

    setUnits: (units) => {
      const current = get().current;
      if (!current || current.units === units) return;
      // Units are display-only: persist the preference without bumping the model version,
      // pushing an undo snapshot, or invalidating the generation.
      const next = { ...current, units };
      const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
      commit(projectsNext, { current: next });
    },
    // Clamp editable strings to the parser's length bound so a saved project always re-opens.
    setBoardName: (name) => mutate((p) => void (p.board.name = name.slice(0, MAX_STRING))),
    setBoardRevision: (rev) => mutate((p) => void (p.board.revision = rev.slice(0, MAX_STRING))),
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
      // Never let the UI exceed the parser's cap (reviewer #2) — a saved board must re-open.
      if ((get().current?.board.holes.length ?? 0) >= MAX_HOLES) return;
      mutate((p) => {
        const label = nextLabel("H", p.board.holes);
        p.board.holes.push({
          id: uid("hole"),
          label,
          centerPx: centerImg,
          diameterMm: unknownVal<number>(),
          fastener: p.mount.defaultFastener,
          fastenerStyle: p.mount.defaultFastenerStyle,
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
        if ("boreDiameterMm" in patch) {
          // Setting a value is a measured override; clearing it (null) reverts the bore to the
          // fastener-profile default.
          const v = patch.boreDiameterMm;
          h.boreDiameterMm = v != null && Number.isFinite(v) && v > 0 ? typeMeasured(v) : undefined;
        }
        if (patch.fastener) h.fastener = patch.fastener;
        if (patch.fastenerStyle) h.fastenerStyle = patch.fastenerStyle;
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
      if ((get().current?.board.keepOuts.length ?? 0) >= MAX_KEEPOUTS) return;
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
        if (patch.defaultFastener) m.defaultFastener = patch.defaultFastener;
        if (patch.defaultFastenerStyle) m.defaultFastenerStyle = patch.defaultFastenerStyle;
        if (patch.sideTabs !== undefined) m.sideTabs = patch.sideTabs;
        if (patch.tolerance) m.tolerance = patch.tolerance;
        if ("customToleranceMm" in patch) {
          const v = patch.customToleranceMm;
          m.customToleranceMm = v != null && Number.isFinite(v) && v >= 0 ? v : null;
        }
        if ("standoffHeightMm" in patch) m.standoffHeightMm = valFromInput(patch.standoffHeightMm ?? null, m.standoffHeightMm);
        if ("baseThicknessMm" in patch) m.baseThicknessMm = valFromInput(patch.baseThicknessMm ?? null, m.baseThicknessMm);
        if ("bossDiameterMm" in patch) m.bossDiameterMm = valFromInput(patch.bossDiameterMm ?? null, m.bossDiameterMm);
        if ("clearanceMm" in patch) m.clearanceMm = valFromInput(patch.clearanceMm ?? null, m.clearanceMm);
      }),

    generate: async () => {
      const project = get().current;
      if (!project) return;
      const key = generationKey(project);
      if (!key) return; // unresolved model (no calibration/outline) — nothing to build yet
      // Drive the SAME keyed build service preview/validation use, then RECORD it as the
      // project's generation. Deduped by key, so a build already kicked for the preview is
      // reused rather than recomputed (reviewer #1).
      const result = await runBuild(key, project);
      // Stale rejection: an edit made during the async build changes the current model's key,
      // so the result of the OLD model must not become the (new) project's generation.
      const latest = get().current;
      if (!latest || latest.id !== project.id || generationKey(latest) !== key) return;
      if (!result.ok) {
        // A coded geometry failure is RECORDED, not silently dropped (reviewer #2), keyed by the
        // model it was computed for. ABORTED is a deliberate cancellation, not a failure.
        if (result.error.code !== "ABORTED") {
          set({ generationError: { key, code: result.error.code, message: result.error.message, feature: result.error.feature } });
        }
        return;
      }
      const model: GeneratedModel = {
        sourceVersion: latest.version,
        key,
        paramsHash: key,
        dims: result.dims,
        warnings: result.warnings, // computed from the EFFECTIVE generated geometry
        createdAt: Date.now(),
        durationMs: buildElapsed.get(key) ?? null,
      };
      const next = { ...latest, generated: model };
      const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
      commit(projectsNext, { current: next, generationError: null });
    },

    ensureBuild: () => {
      // Cache a build for the current model WITHOUT recording it as the generation (preview
      // and validation consume it). Idempotent: a no-op when already built or in flight.
      const project = get().current;
      if (!project) return;
      const key = generationKey(project);
      if (!key || get().builds[key]) return;
      void runBuild(key, project);
    },

    cancelGenerate: () => {
      // Real cancellation: abort every in-flight build controller → the build client terminates
      // the worker, stopping the off-thread computation rather than waiting it out (reviewer #1).
      for (const [k, v] of buildInflight) {
        v.controller.abort();
        buildInflight.delete(k);
      }
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
      exportAbort?.abort(); // terminate any in-flight export serialization
      exportAbort = null;
      exportSeq += 1;
      get().cancelGenerate(); // closing the dialog stops any generation it kicked off
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, open: false, phase: "idle", progress: 0 } } }));
    },
    setExportFormat: (format) => set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, format } } })),
    toggleSidecar: () => set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, writeSidecar: !s.ui.export.writeSidecar } } })),
    toggleAckInferred: () => set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, acknowledgedInferred: !s.ui.export.acknowledgedInferred } } })),

    runExport: () => {
      const current = get().current;
      if (!current) return;
      // Honesty gate (reviewer #5C): never build an artifact carrying inferred fabrication
      // dimensions the user has not explicitly acknowledged.
      if (inferredFabricationDims(current).length > 0 && !get().ui.export.acknowledgedInferred) return;
      const projectId = current.id; // finalize must apply to THIS project, not whatever is current later
      const options = { format: get().ui.export.format, writeSidecar: get().ui.export.writeSidecar };
      // Hand the export worker the SAME build the geometry service already produced (reviewer
      // #1): the serialization + SHA-256 hashing run off the main thread as a real cancellable
      // job, and progress reflects completed stages, not a synthetic timer.
      const key = generationKey(current);
      const cached = key ? get().builds[key] : undefined;
      const prebuilt = cached && cached.ok ? cached : undefined;

      stopExportTimer();
      exportAbort?.abort();
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      exportAbort = controller;
      const seq = ++exportSeq;
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "progress", progress: 4, stage: "Building solid from the canonical model", artifact: null, errorCode: null, errorDetail: null } } }));

      return requestExport(current, options, {
        prebuilt,
        signal: controller?.signal,
        onProgress: (progress, stage) => {
          if (seq !== exportSeq) return; // superseded by a newer/cancelled run
          const active = get().current;
          if (!active || active.id !== projectId) return;
          // Only advance a run still showing progress (a cancel/close resets the phase).
          set((s) => (s.ui.export.phase === "progress" ? { ui: { ...s.ui, export: { ...s.ui.export, progress, stage } } } : {}));
        },
      }).then((outcome) => {
        if (seq !== exportSeq) return; // superseded/cancelled — its UI is already reset
        if (exportAbort === controller) exportAbort = null;
        const active = get().current;
        if (!active || active.id !== projectId) return; // user switched projects mid-export
        if (outcome.status === "aborted") return;
        if (outcome.status === "error") {
          set((s) => ({
            ui: {
              ...s.ui,
              export: {
                ...s.ui.export,
                phase: "failed",
                errorCode: "EXPORT_NOT_READY",
                errorDetail: outcome.readiness.blockers.map((b) => b.title).join(" · ") || "Readiness gate failed.",
              },
            },
          }));
          return;
        }
        // Prepared IN MEMORY only. No ExportRecord is written to project history until the user
        // actually downloads (see commitExportDownload).
        set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "complete", progress: 100, artifact: outcome.artifact } } }));
      });
    },

    commitExportDownload: (): DownloadResult => {
      const art = get().ui.export.artifact;
      const current = get().current;
      if (!art || !current) return { initiated: false, reason: "No prepared artifact to download." };

      // Attempt the real download FIRST and record ONLY on a confirmed initiation (reviewer #6):
      // a download that never started must never leave a history record claiming it did.
      const result = downloadAdapter(artifactFiles(art));
      if (!result.initiated) {
        set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, downloadError: result.reason } } }));
        return result;
      }

      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, downloadError: null } } }));
      if (current.exports.some((e) => e.id === art.record.id)) return result; // already recorded
      // The record is bound to this project's id + version + generation key (reviewer #6), so
      // it is self-describing. Deliberate retention policy (reviewer #2): the ledger keeps the
      // most recent MAX_EXPORTS records so it can never cross the parser cap and make the
      // project un-openable. Newest first; older records are archived out rather than growing.
      const next = { ...current, exports: [art.record, ...current.exports].slice(0, MAX_EXPORTS) };
      const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
      commit(projectsNext, { current: next });
      return result;
    },

    cancelExport: () => {
      stopExportTimer();
      // Real cancellation: terminate the export worker mid-serialization and bump the token so a
      // late result is discarded, then stop any generation it kicked off.
      exportAbort?.abort();
      exportAbort = null;
      exportSeq += 1;
      get().cancelGenerate();
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
      // Never hand the user a file this version cannot re-open (reviewer #2). The mutation
      // guards keep this from firing in practice; it's the last-line invariant check.
      const rt = projectRoundTrips(project);
      if (!rt.ok) {
        set({ saveState: "error", lastSaveError: `Cannot export project file — it would not re-open (${rt.error}).` });
        return;
      }
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
      // Transactional (reviewer #5): persist FIRST, and only open/route to the imported
      // project when the write succeeds. A quota failure must never leave the user editing an
      // apparently-imported project that was never made durable — it stays on the library
      // screen with a visible error instead.
      const res = persistLibrary(projectsNext);
      if (!res.ok) {
        // Do not add the non-durable project to the in-memory list or route to it.
        set({ saveState: "error", lastSaveError: res.error ?? "Save failed" });
        return { ok: false, error: res.error ?? "Could not save the imported project — storage may be full.", id: project.id };
      }
      set({
        projects: projectsNext,
        current: project,
        route: { view: "designer", projectId: project.id },
        ui: freshDesignerUi(project),
        past: [],
        future: [],
        saveState: "saved",
        lastSavedAt: Date.now(),
        lastSaveError: null,
      });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
      return { ok: true, id: project.id };
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
