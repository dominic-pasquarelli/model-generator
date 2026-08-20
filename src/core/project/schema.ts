/**
 * Project persistence: create, serialize, and load with forward migrations.
 * The MVP keeps a single schema version (1) but ships the migration machinery and
 * a v0→v1 example so real user files never accumulate before migrations exist
 * (ADR 0007). Corrupt files fail with a diagnosable error, never silent defaults.
 */
import { uid } from "@/lib/id";
import type { MountStrategy, Project } from "./types";
import { GENERATOR_VERSION, SCHEMA_VERSION } from "./types";
import { inferred, unknownVal } from "./value";

export interface ProjectFile {
  schemaVersion: number;
  project: Project;
}

export class MgFileError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MgFileError";
    this.code = code;
  }
}

/** Sensible, clearly-editable design defaults for a fresh mount strategy. */
export function defaultMount(): MountStrategy {
  return {
    kind: "plate-standoffs",
    standoffHeightMm: inferred(6),
    baseThicknessMm: inferred(3),
    fastener: "M3",
    fastenerStyle: "heat-set-insert",
    bossDiameterMm: inferred(7),
    sideTabs: 2,
    clearanceMm: inferred(0.3),
    tolerance: "fdm-0.20",
  };
}

export interface CreateProjectOptions {
  name?: string;
  now?: number;
  units?: Project["units"];
}

export function createProject(opts: CreateProjectOptions = {}): Project {
  const now = opts.now ?? Date.now();
  return {
    id: uid("proj"),
    name: opts.name?.trim() || "untitled-mount",
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    units: opts.units ?? "mm",
    createdAt: now,
    updatedAt: now,
    generatorVersion: GENERATOR_VERSION,
    reference: null,
    calibration: null,
    board: {
      id: uid("board"),
      name: "",
      revision: "",
      outline: null,
      thicknessMm: unknownVal<number>(),
      holes: [],
      keepOuts: [],
    },
    mount: defaultMount(),
    generated: null,
    exports: [],
  };
}

export function serializeProject(project: Project): string {
  const file: ProjectFile = { schemaVersion: project.schemaVersion, project };
  return JSON.stringify(file, null, 2);
}

/** A single forward migration. */
export interface Migration {
  from: number;
  to: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Forward-only migrations keyed by source version. The v0→v1 entry is illustrative:
 * a pre-mount-strategy file gets today's default mount grafted on so it still opens.
 */
export const MIGRATIONS: Migration[] = [
  {
    from: 0,
    to: 1,
    migrate: (raw) => {
      const project = (raw.project ?? {}) as Record<string, unknown>;
      if (!project.mount) project.mount = defaultMount();
      if (project.version == null) project.version = 1;
      if (project.generatorVersion == null) project.generatorVersion = GENERATOR_VERSION;
      if (!Array.isArray(project.exports)) project.exports = [];
      project.schemaVersion = 1;
      return { ...raw, schemaVersion: 1, project };
    },
  },
];

function detectVersion(raw: Record<string, unknown>): number {
  const top = raw.schemaVersion;
  if (typeof top === "number") return top;
  const proj = raw.project as Record<string, unknown> | undefined;
  if (proj && typeof proj.schemaVersion === "number") return proj.schemaVersion;
  // No version marker at all → treat as the pre-versioned v0.
  return 0;
}

export function migrateData(raw: Record<string, unknown>): Record<string, unknown> {
  let current = raw;
  let version = detectVersion(current);
  let guard = 0;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) {
      throw new MgFileError(
        "NO_MIGRATION_PATH",
        `No migration from schema v${version} to v${SCHEMA_VERSION}. This file predates a supported version.`,
      );
    }
    current = step.migrate(current);
    version = step.to;
    if (++guard > 64) throw new MgFileError("MIGRATION_LOOP", "Migration did not converge.");
  }
  if (version > SCHEMA_VERSION) {
    throw new MgFileError(
      "FUTURE_SCHEMA",
      `File is schema v${version}, newer than this app (v${SCHEMA_VERSION}). Update the app to open it.`,
    );
  }
  return current;
}

/** Parse a project file's text, migrating as needed. Throws MgFileError on corruption. */
export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MgFileError("INVALID_JSON", "This file is not valid JSON — it may be corrupt or truncated.");
  }
  if (!raw || typeof raw !== "object") {
    throw new MgFileError("NOT_AN_OBJECT", "Project file root is not an object.");
  }
  const migrated = migrateData(raw as Record<string, unknown>);
  const project = migrated.project as Project | undefined;
  if (!project || typeof project !== "object") {
    throw new MgFileError("MISSING_PROJECT", "Project file has no `project` payload.");
  }
  // When both are present they must agree — a top-level/project schema-version mismatch
  // is a corrupt or hand-edited file, not a migratable one.
  const topV = (migrated as Record<string, unknown>).schemaVersion;
  const projV = (project as unknown as Record<string, unknown>).schemaVersion;
  if (typeof topV === "number" && typeof projV === "number" && topV !== projV) {
    throw new MgFileError("SCHEMA_MISMATCH", `Top-level schema v${topV} does not match project schema v${projV}.`);
  }
  validateProjectShape(project as unknown as Record<string, unknown>);
  return { schemaVersion: SCHEMA_VERSION, project };
}

// ---- Runtime shape validation ----
// Decode every nested field the shell actually consumes before casting to Project, so
// structurally-malformed data (e.g. `board: null`, a hole with no `centerPx`) fails at
// parse with a diagnosable error instead of crashing a consumer later.

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function isPoint(v: unknown): boolean {
  return isObj(v) && isNum(v.x) && isNum(v.y);
}
function isRect(v: unknown): boolean {
  return isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.w) && isNum(v.h);
}

// Canonical enum vocabularies (kept in sync with types.ts). A file carrying any value
// outside these is rejected rather than silently accepted into geometry/preview/export.
const UNITS = new Set(["mm", "inch"]);
const SOURCES = new Set(["inferred", "measured", "confirmed"]);
const FASTENERS = new Set(["M2", "M2.5", "M3", "M4", "custom"]);
const STRATEGIES = new Set(["plate-standoffs", "rect-plate", "standoff-bridge"]);
const FASTENER_STYLES = new Set(["heat-set-insert", "self-tapping", "through-bolt"]);
const TOLERANCES = new Set(["fdm-0.20", "fdm-0.15", "sla-0.05", "custom"]);
const KEEPOUT_SHAPES = new Set(["rect", "circle", "polygon"]);
const BOARD_SIDES = new Set(["top", "bottom"]);
const HOLE_POSITIONS = new Set(["clicked-calibrated", "typed", "inferred-pattern"]);
const CAL_STATUS = new Set(["uncalibrated", "valid", "invalid"]);
const CAL_SOURCES = new Set(["calipers", "datasheet", "ruler-in-photo", "known-feature", "other"]);
const CAPTURE_KINDS = new Set(["photo", "scan", "drawing", "unknown"]);
const EXPORT_FORMATS = new Set(["step", "stl"]);

function isEnum(v: unknown, set: Set<string>): boolean {
  return isStr(v) && set.has(v);
}
/**
 * A Val<number>: EITHER {known:false} OR {known:true, value:<finite number>, source:<enum>}.
 * Crucially, a known value must be a real finite number — a string "3" is rejected so
 * JS coercion can never turn imported text into NaN/concatenated geometry.
 */
function isValNum(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.known === false) return true;
  return v.known === true && isNum(v.value) && isEnum(v.source, SOURCES);
}
function req(cond: boolean, path: string): void {
  if (!cond) throw new MgFileError("INVALID_SHAPE", `Project field \`${path}\` is malformed.`);
}

function validateHole(h: unknown, path: string): void {
  req(isObj(h), path);
  const hole = h as Record<string, unknown>;
  req(isStr(hole.id) && isStr(hole.label), `${path}.id/label`);
  req(isPoint(hole.centerPx), `${path}.centerPx`);
  req(isValNum(hole.diameterMm), `${path}.diameterMm`);
  req(isEnum(hole.fastener, FASTENERS), `${path}.fastener`);
  req(isEnum(hole.positionSource, HOLE_POSITIONS), `${path}.positionSource`);
  req(isEnum(hole.state, SOURCES), `${path}.state`);
}

function validateKeepOut(k: unknown, path: string): void {
  req(isObj(k), path);
  const ko = k as Record<string, unknown>;
  req(isStr(ko.id) && isStr(ko.label) && isStr(ko.purpose), `${path}.id/label/purpose`);
  req(isEnum(ko.shape, KEEPOUT_SHAPES), `${path}.shape`);
  req(isEnum(ko.boardSide, BOARD_SIDES), `${path}.boardSide`);
  req(isValNum(ko.clearanceHeightMm), `${path}.clearanceHeightMm`);
  req(isEnum(ko.state, SOURCES), `${path}.state`);
  // The discriminator and the populated payload must agree — a "rect" with only a
  // circlePx would otherwise slip past generation/validation.
  if (ko.shape === "rect") req(isRect(ko.rectPx), `${path}.rectPx`);
  else if (ko.shape === "circle")
    req(isObj(ko.circlePx) && isPoint((ko.circlePx as Record<string, unknown>).center) && isNum((ko.circlePx as Record<string, unknown>).radiusPx), `${path}.circlePx`);
  else req(Array.isArray(ko.polygonPx) && (ko.polygonPx as unknown[]).length >= 3 && (ko.polygonPx as unknown[]).every(isPoint), `${path}.polygonPx`);
}

function validateGenerated(g: Record<string, unknown>): void {
  req(isNum(g.sourceVersion) && isStr(g.key) && isStr(g.paramsHash), "generated.header");
  req(isObj(g.dims), "generated.dims");
  const d = g.dims as Record<string, unknown>;
  for (const f of ["widthMm", "depthMm", "heightMm", "standoffCount", "bodies", "triangles"]) {
    req(isNum(d[f]), `generated.dims.${f}`);
  }
  req(Array.isArray(g.warnings) && (g.warnings as unknown[]).every(isStr), "generated.warnings");
  req(isNum(g.createdAt), "generated.createdAt");
  req(g.durationMs === null || isNum(g.durationMs), "generated.durationMs");
}

function validateExportRecord(e: unknown, path: string): void {
  req(isObj(e), path);
  const r = e as Record<string, unknown>;
  req(isStr(r.id) && isStr(r.fileName) && isStr(r.paramsHash) && isStr(r.generationKey), `${path}.strings`);
  req(isEnum(r.format, EXPORT_FORMATS), `${path}.format`);
  req(isNum(r.sizeBytes) && isNum(r.createdAt), `${path}.numbers`);
  req(isBool(r.wroteSidecar), `${path}.wroteSidecar`);
}

export function validateProjectShape(project: Record<string, unknown>): void {
  req(isStr(project.id), "id");
  req(isStr(project.name), "name");
  req(isNum(project.version), "version");
  req(project.schemaVersion === SCHEMA_VERSION, "schemaVersion");
  req(isEnum(project.units, UNITS), "units");
  req(isNum(project.createdAt) && isNum(project.updatedAt), "createdAt/updatedAt");
  req(isStr(project.generatorVersion), "generatorVersion");

  const board = project.board;
  req(isObj(board), "board");
  const b = board as Record<string, unknown>;
  req(isStr(b.name) && isStr(b.revision), "board.name/revision");
  req(isValNum(b.thicknessMm), "board.thicknessMm");
  req(Array.isArray(b.holes), "board.holes");
  req(Array.isArray(b.keepOuts), "board.keepOuts");
  (b.holes as unknown[]).forEach((h, i) => validateHole(h, `board.holes[${i}]`));
  (b.keepOuts as unknown[]).forEach((k, i) => validateKeepOut(k, `board.keepOuts[${i}]`));
  if (b.outline !== null && b.outline !== undefined) {
    req(isObj(b.outline), "board.outline");
    const o = b.outline as Record<string, unknown>;
    req(Array.isArray(o.vertices) && (o.vertices as unknown[]).length >= 3 && (o.vertices as unknown[]).every(isPoint), "board.outline.vertices");
    req(isValNum(o.cornerRadiusMm), "board.outline.cornerRadiusMm");
    req(isBool(o.confirmed), "board.outline.confirmed");
  }

  const mount = project.mount;
  req(isObj(mount), "mount");
  const m = mount as Record<string, unknown>;
  req(isEnum(m.kind, STRATEGIES), "mount.kind");
  req(isEnum(m.fastener, FASTENERS), "mount.fastener");
  req(isEnum(m.fastenerStyle, FASTENER_STYLES), "mount.fastenerStyle");
  req(isEnum(m.tolerance, TOLERANCES), "mount.tolerance");
  req(m.sideTabs === 0 || m.sideTabs === 2 || m.sideTabs === 4, "mount.sideTabs");
  for (const f of ["standoffHeightMm", "baseThicknessMm", "bossDiameterMm", "clearanceMm"]) {
    req(isValNum(m[f]), `mount.${f}`);
  }

  if (project.reference !== null && project.reference !== undefined) {
    req(isObj(project.reference), "reference");
    const r = project.reference as Record<string, unknown>;
    req(isStr(r.id) && isStr(r.assetName) && isStr(r.src), "reference.strings");
    req(isNum(r.widthPx) && r.widthPx > 0 && isNum(r.heightPx) && r.heightPx > 0, "reference.dimensions");
    req(isNum(r.rotationDeg), "reference.rotationDeg");
    req(isObj(r.capture) && isStr((r.capture as Record<string, unknown>).label) && isEnum((r.capture as Record<string, unknown>).kind, CAPTURE_KINDS), "reference.capture");
  }
  if (project.calibration !== null && project.calibration !== undefined) {
    req(isObj(project.calibration), "calibration");
    const c = project.calibration as Record<string, unknown>;
    req(isStr(c.id), "calibration.id");
    req(Array.isArray(c.anchors) && (c.anchors as unknown[]).length === 2 && (c.anchors as unknown[]).every(isPoint), "calibration.anchors");
    req(isValNum(c.knownMm), "calibration.knownMm");
    req(isEnum(c.source, CAL_SOURCES), "calibration.source");
    req(isEnum(c.status, CAL_STATUS), "calibration.status");
    req(c.pxPerMm === null || isNum(c.pxPerMm), "calibration.pxPerMm");
    if (c.status === "valid") req(isNum(c.pxPerMm) && (c.pxPerMm as number) > 0, "calibration.pxPerMm (valid requires a positive scale)");
  }

  if (project.generated !== null && project.generated !== undefined) {
    req(isObj(project.generated), "generated");
    validateGenerated(project.generated as Record<string, unknown>);
  }
  req(Array.isArray(project.exports), "exports");
  (project.exports as unknown[]).forEach((e, i) => validateExportRecord(e, `exports[${i}]`));
}
