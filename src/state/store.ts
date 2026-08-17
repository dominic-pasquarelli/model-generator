/**
 * Application store (zustand). Holds the local project library, the current
 * canonical project, and all transient designer UI state. All model mutations go
 * through `mutate()`, which bumps the version, marks any prior generation stale,
 * and autosaves — so preview/export always reflect the latest semantic model.
 */
import { create } from "zustand";
import type { Point } from "@/core/geom";
import { bbox, normalizeRect } from "@/core/geom";
import { boardFrame, boardMmToPxPoint } from "@/core/project/derive";
import { createSeedLibrary } from "@/core/project/fixtures";
import { createProject, parseProjectFile } from "@/core/project/schema";
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
import { exportReadiness } from "@/core/validation/validate";
import { mockGenerator } from "@/core/geometry/mockGenerator";
import { buildExport, type ExportArtifact } from "@/core/export/exporter";
import { uid } from "@/lib/id";

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
  export: ExportUiState;
}

const STORAGE_KEY = "mg.projects";
const THEME_KEY = "mg.theme";

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

function loadLibrary(): Project[] {
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
    return createSeedLibrary();
  }
  if (!Array.isArray(arr)) return createSeedLibrary();
  // Parse each project independently: one corrupt entry must not discard the rest.
  // Omitting the top-level schemaVersion lets each project's own version drive migration.
  const out: Project[] = [];
  for (const p of arr) {
    try {
      out.push(parseProjectFile(JSON.stringify({ project: p })).project);
    } catch {
      /* skip a single corrupt project; keep the survivors */
    }
  }
  return out;
}

function persistLibrary(projects: Project[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    /* storage may be unavailable; local session still works */
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
function stopExportTimer() {
  if (exportTimer) {
    clearTimeout(exportTimer);
    exportTimer = null;
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

export interface AppState {
  theme: Theme;
  route: Route;
  projects: Project[];
  current: Project | null;
  ui: DesignerUi;
  savedBoards: SavedBoardDefinition[];
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
  markReferenceMissing: (missing: boolean) => void;
  openCalibration: () => void;
  closeCalibration: () => void;
  applyCalibration: (knownMm: number, source: CalibrationSourceKind) => boolean;
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

  // persistence
  saveBoardToLibrary: () => void;
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

  /** Commit a model change: clone, mutate, bump version, mark generation stale, autosave. */
  function mutate(mutator: (p: Project) => void) {
    const current = get().current;
    if (!current) return;
    const next = structuredClone(current) as Project;
    mutator(next);
    next.version += 1;
    next.updatedAt = Date.now();
    if (next.generated) next.generated = { ...next.generated, upToDate: false };
    const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
    persistLibrary(projectsNext);
    set({ current: next, projects: projectsNext });
    if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
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
    savedBoards: [],
    cursor: null,
    setCursor: (p) => set({ cursor: p }),

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
      set({ current: project, route: { view: "designer", projectId: id }, ui: freshDesignerUi(project) });
      if (get().ui.autoGenerate) queueMicrotask(() => get().ensureGenerated());
    },

    newProject: (name) => {
      stopExportTimer();
      const project = createProject({ name });
      const projectsNext = [project, ...get().projects];
      persistLibrary(projectsNext);
      set({
        projects: projectsNext,
        current: project,
        route: { view: "designer", projectId: project.id },
        ui: freshDesignerUi(project),
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

    markReferenceMissing: (missing) =>
      mutate((p) => {
        if (p.reference) p.reference.missing = missing;
      }),

    openCalibration: () => set((s) => ({ ui: { ...s.ui, calibrationOpen: true, activeTool: "calibrate" } })),
    closeCalibration: () => set((s) => ({ ui: { ...s.ui, calibrationOpen: false } })),

    applyCalibration: (knownMm, source) => {
      const current = get().current;
      if (!current || !current.reference) return false;
      // Default anchors at the sample's top mounting holes; a full editor lets the
      // user drag these. Rejected calibrations never overwrite a prior valid one.
      const existing = current.calibration;
      const anchors: [Point, Point] = existing?.anchors ?? [
        { x: 110, y: 85 },
        { x: 890, y: 85 },
      ];
      const assessment = assessCalibration(anchors[0], anchors[1], knownMm);
      if (!assessment.valid) {
        // Keep a prior *valid* calibration untouched — and do not bump version /
        // invalidate the generation on a pure no-op. Only record a fresh rejection.
        if (existing && existing.status === "valid") return false;
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
        return false;
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
      return true;
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
        if (patch.shape) k.shape = patch.shape as KeepOutShape;
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
      const result = await mockGenerator.generate(current);
      const latest = get().current;
      if (!latest || latest.id !== current.id) return;
      if (result.ok) {
        const next = { ...latest, generated: result.model };
        const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
        persistLibrary(projectsNext);
        set({ current: next, projects: projectsNext });
      }
    },

    ensureGenerated: () => {
      const current = get().current;
      if (!current) return;
      const gen = current.generated;
      const readiness = exportReadiness(current);
      // Generate when we could, and don't have an up-to-date result.
      const canGenerate = readiness.blockers.length === 0 && !!boardFrame(current) && current.board.holes.length > 0;
      if (canGenerate && (!gen || !gen.upToDate)) void get().generate();
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
      const stages = [
        "boolean: base plate",
        "boolean: standoff 1 / 4",
        "boolean: standoff 4 / 4",
        "writing metadata sidecar",
      ];
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
          exportTimer = setTimeout(tick, 420);
          return;
        }
        // Finalize.
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
        const next = { ...active, exports: [built.artifact.record, ...active.exports] };
        const projectsNext = get().projects.map((p) => (p.id === next.id ? next : p));
        persistLibrary(projectsNext);
        set((s) => ({
          current: next,
          projects: projectsNext,
          ui: { ...s.ui, export: { ...s.ui.export, phase: "complete", progress: 100, artifact: built.artifact } },
        }));
      };
      exportTimer = setTimeout(tick, 420);
    },

    cancelExport: () => {
      stopExportTimer();
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "idle", progress: 0, stage: "" } } }));
    },
    retryExport: () =>
      set((s) => ({ ui: { ...s.ui, export: { ...s.ui.export, phase: "idle", progress: 0, errorCode: null, errorDetail: null } } })),

    saveBoardToLibrary: () => {
      const current = get().current;
      if (!current) return;
      const def: SavedBoardDefinition = {
        id: uid("bdef"),
        name: current.board.name || current.name,
        revision: current.board.revision,
        savedAt: Date.now(),
        board: structuredClone(current.board),
        calibration: current.calibration ? structuredClone(current.calibration) : null,
      };
      set((s) => ({ savedBoards: [def, ...s.savedBoards] }));
    },
  };
});

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
