/**
 * Project persistence: create, serialize, and load with forward migrations.
 * The MVP keeps a single schema version (1) but ships the migration machinery and
 * a v0→v1 example so real user files never accumulate before migrations exist
 * (ADR 0007). Corrupt files fail with a diagnosable error, never silent defaults.
 */
import { uid } from "@/lib/id";
import { assessCalibration } from "@/core/units/units";
import { isSimpleRing, ringArea, type Pt } from "@/core/geometry/poly2d";
import type { MountStrategy, Project } from "./types";
import { GENERATOR_VERSION, SCHEMA_VERSION } from "./types";
import { inferred, unknownVal } from "./value";

// Resource + magnitude bounds for the untrusted import boundary (reviewer #5). A file (or
// any collection/coordinate/string within it) beyond these is rejected before geometry or
// persistence work begins, so a hostile or corrupt file cannot exhaust memory or drive the
// generator with absurd inputs.
const MAX_FILE_BYTES = 12_000_000;
const MAX_COORD = 1_000_000; // px magnitude for any stored coordinate
const MAX_HOLES = 1_000;
const MAX_KEEPOUTS = 1_000;
const MAX_EXPORTS = 5_000;
const MAX_RING_VERTICES = 5_000;
const MAX_STRING = 8_192;
const MAX_REF_SRC_BYTES = 12_000_000;
/** Cap on the count of imported generated warnings (each also length-bounded by MAX_STRING). */
const MAX_WARNINGS = 500;
/** Upper bound for any imported timestamp (ms): 3000-01-01. Rejects absurd/far-future dates. */
const MAX_TIMESTAMP = 32_503_680_000_000;
/** Relative tolerance when re-deriving the calibration scale from the anchors on import. */
const PX_PER_MM_REL_TOL = 1e-3;

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
      // v0 is a pre-mount-strategy file. Graft today's default mount and fill every other
      // now-required top-level field deterministically, so a genuine v0 file opens all the
      // way through parseProjectFile (reviewer #5) rather than tripping shape validation.
      const project = (raw.project ?? {}) as Record<string, unknown>;
      if (!project.mount) project.mount = defaultMount();
      if (project.version == null) project.version = 1;
      if (project.units == null) project.units = "mm";
      if (project.createdAt == null) project.createdAt = 0;
      if (project.updatedAt == null) project.updatedAt = 0;
      if (project.generatorVersion == null) project.generatorVersion = GENERATOR_VERSION;
      if (project.generated === undefined) project.generated = null;
      if (project.reference === undefined) project.reference = null;
      if (project.calibration === undefined) project.calibration = null;
      if (!Array.isArray(project.exports)) project.exports = [];
      const board = (project.board ?? {}) as Record<string, unknown>;
      if (board.name == null) board.name = "";
      if (board.revision == null) board.revision = "";
      if (board.thicknessMm == null) board.thicknessMm = unknownVal<number>();
      if (board.outline === undefined) board.outline = null;
      if (!Array.isArray(board.holes)) board.holes = [];
      if (!Array.isArray(board.keepOuts)) board.keepOuts = [];
      project.board = board;
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
  if (text.length > MAX_FILE_BYTES) {
    throw new MgFileError("FILE_TOO_LARGE", `Project file is ${text.length} bytes, larger than the ${MAX_FILE_BYTES}-byte limit.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MgFileError("INVALID_JSON", "This file is not valid JSON — it may be corrupt or truncated.");
  }
  if (!raw || typeof raw !== "object") {
    throw new MgFileError("NOT_AN_OBJECT", "Project file root is not an object.");
  }
  // Check the RAW schema markers BEFORE migrating (reviewer #5): a v0 migration would
  // normalise a project marker and erase the evidence of a top-level/project disagreement.
  const rawObj = raw as Record<string, unknown>;
  const rawTopV = rawObj.schemaVersion;
  const rawProjV = (rawObj.project as Record<string, unknown> | undefined)?.schemaVersion;
  // A PRESENT top-level marker must be a number: a string-valued marker (e.g. "2") paired
  // with a valid project marker must be rejected, not silently ignored (reviewer #4).
  if ("schemaVersion" in rawObj && typeof rawTopV !== "number") {
    throw new MgFileError("SCHEMA_MISMATCH", "Top-level `schemaVersion` marker is present but not a number.");
  }
  if (typeof rawTopV === "number" && typeof rawProjV === "number" && rawTopV !== rawProjV) {
    throw new MgFileError("SCHEMA_MISMATCH", `Top-level schema v${rawTopV} does not match project schema v${rawProjV}.`);
  }
  const migrated = migrateData(rawObj);
  const project = migrated.project as Project | undefined;
  if (!project || typeof project !== "object") {
    throw new MgFileError("MISSING_PROJECT", "Project file has no `project` payload.");
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
function inBounds(n: unknown): n is number {
  return isNum(n) && Math.abs(n) <= MAX_COORD;
}
/** A point whose coordinates are finite AND within the magnitude bound. */
function isPointB(v: unknown): boolean {
  return isObj(v) && inBounds(v.x) && inBounds(v.y);
}
function isRect(v: unknown): boolean {
  return isObj(v) && inBounds(v.x) && inBounds(v.y) && inBounds(v.w) && inBounds(v.h);
}
/** A string present and within the length bound (defends against pathological blobs). */
function isBoundedStr(v: unknown): v is string {
  return isStr(v) && v.length <= MAX_STRING;
}
/** A non-negative finite number (real-valued sizes/dimensions). */
function isNonNeg(v: unknown): v is number {
  return isNum(v) && v >= 0;
}
/**
 * A positive SAFE integer (versions). Number.isSafeInteger rejects >= 2^53, where `v + 1`
 * no longer advances — an imported such version would stall the monotonic version counter
 * and defeat unique export filenames (reviewer #4).
 */
function isPosInt(v: unknown): v is number {
  return isNum(v) && Number.isSafeInteger(v) && v > 0;
}
/** A non-negative safe integer (counts, byte sizes). */
function isSafeCount(v: unknown): v is number {
  return isNum(v) && Number.isSafeInteger(v) && v >= 0;
}
/** A timestamp (ms) within a sane epoch..year-3000 range, not merely any finite number. */
function isTimestamp(v: unknown): v is number {
  return isNum(v) && v >= 0 && v <= MAX_TIMESTAMP;
}
/** A simple, bounded, non-zero-area ring of 3..MAX_RING_VERTICES points. */
function isValidRing(v: unknown, path: string): void {
  req(Array.isArray(v) && v.length >= 3 && v.length <= MAX_RING_VERTICES, `${path} (vertex count)`);
  const arr = v as unknown[];
  req(arr.every(isPointB), `${path} (finite, in-bounds points)`);
  const ring = arr as Pt[];
  req(isSimpleRing(ring), `${path} (self-intersecting or degenerate ring)`);
  req(Math.abs(ringArea(ring)) > 1e-6, `${path} (zero-area ring)`);
}

/**
 * An imported reference `src` must be a raster data URL or an app-relative asset path — NOT
 * a remote/other scheme (reviewer #5). The canvas passes this straight to <img src>, so an
 * `https:`/`//` value would fire an off-origin request, breaking the local-only posture.
 */
function isSafeReferenceSrc(v: unknown): boolean {
  if (!isStr(v) || v.length === 0 || v.length > MAX_REF_SRC_BYTES) return false;
  if (/^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(v)) return true;
  // Anything carrying an explicit scheme, or protocol-relative, or a parent-dir escape, is out.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false; // has a URI scheme (http:, file:, data:svg, javascript:, ...)
  if (v.startsWith("//")) return false; // protocol-relative
  if (v.includes("..")) return false; // path traversal
  // App-relative asset path (bundled under the app origin).
  return /^\/?[A-Za-z0-9._\-/]+$/.test(v);
}

function assertUniqueIds(items: { id?: unknown }[], path: string): void {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const id = items[i].id;
    req(isStr(id), `${path}[${i}].id`);
    req(!seen.has(id as string), `${path}[${i}].id (duplicate id)`);
    seen.add(id as string);
  }
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
  req(isBoundedStr(hole.id) && isBoundedStr(hole.label), `${path}.id/label`);
  req(isPointB(hole.centerPx), `${path}.centerPx`);
  req(isValNum(hole.diameterMm), `${path}.diameterMm`);
  req(isEnum(hole.fastener, FASTENERS), `${path}.fastener`);
  req(isEnum(hole.positionSource, HOLE_POSITIONS), `${path}.positionSource`);
  req(isEnum(hole.state, SOURCES), `${path}.state`);
}

function validateKeepOut(k: unknown, path: string): void {
  req(isObj(k), path);
  const ko = k as Record<string, unknown>;
  req(isBoundedStr(ko.id) && isBoundedStr(ko.label) && isBoundedStr(ko.purpose), `${path}.id/label/purpose`);
  req(isEnum(ko.shape, KEEPOUT_SHAPES), `${path}.shape`);
  req(isEnum(ko.boardSide, BOARD_SIDES), `${path}.boardSide`);
  req(isValNum(ko.clearanceHeightMm), `${path}.clearanceHeightMm`);
  req(isEnum(ko.state, SOURCES), `${path}.state`);
  // The discriminator and the populated payload must agree, each shape's dimensions must be
  // positive/simple, AND the other two payloads must be ABSENT — a "rect" carrying a stale
  // circlePx/polygonPx (a real risk on the untrusted import path) must be rejected, not
  // silently accepted, or the "discriminator/payload agreement" claim is a lie (reviewer #4).
  const absent = (field: string) => req(ko[field] === undefined, `${path}.${field} (extraneous payload for a ${ko.shape} keep-out)`);
  if (ko.shape === "rect") {
    req(isRect(ko.rectPx), `${path}.rectPx`);
    const r = ko.rectPx as Record<string, unknown>;
    req((r.w as number) > 0 && (r.h as number) > 0, `${path}.rectPx (non-positive size)`);
    absent("circlePx");
    absent("polygonPx");
  } else if (ko.shape === "circle") {
    const c = ko.circlePx as Record<string, unknown> | undefined;
    req(isObj(c) && isPointB(c!.center) && inBounds(c!.radiusPx) && (c!.radiusPx as number) > 0, `${path}.circlePx`);
    absent("rectPx");
    absent("polygonPx");
  } else {
    isValidRing(ko.polygonPx, `${path}.polygonPx`);
    absent("rectPx");
    absent("circlePx");
  }
}

function validateGenerated(g: Record<string, unknown>): void {
  req(isPosInt(g.sourceVersion) && isBoundedStr(g.key) && isBoundedStr(g.paramsHash), "generated.header");
  req(isObj(g.dims), "generated.dims");
  const d = g.dims as Record<string, unknown>;
  for (const f of ["widthMm", "depthMm", "heightMm"]) req(isNonNeg(d[f]), `generated.dims.${f}`);
  for (const f of ["standoffCount", "bodies", "triangles"]) req(isSafeCount(d[f]), `generated.dims.${f}`);
  req(Array.isArray(g.warnings) && (g.warnings as unknown[]).length <= MAX_WARNINGS && (g.warnings as unknown[]).every(isBoundedStr), "generated.warnings (count/length)");
  req(isTimestamp(g.createdAt), "generated.createdAt");
  req(g.durationMs === null || isNonNeg(g.durationMs), "generated.durationMs");
}

function validateExportRecord(e: unknown, path: string): void {
  req(isObj(e), path);
  const r = e as Record<string, unknown>;
  req(isBoundedStr(r.id) && isBoundedStr(r.fileName) && isBoundedStr(r.paramsHash) && isBoundedStr(r.generationKey), `${path}.strings`);
  req(isEnum(r.format, EXPORT_FORMATS), `${path}.format`);
  req(isSafeCount(r.sizeBytes) && isTimestamp(r.createdAt), `${path}.numbers (safe size, in-range timestamp)`);
  req(isBool(r.wroteSidecar), `${path}.wroteSidecar`);
}

export function validateProjectShape(project: Record<string, unknown>): void {
  req(isBoundedStr(project.id), "id");
  req(isBoundedStr(project.name), "name");
  req(isPosInt(project.version), "version (positive integer)");
  req(project.schemaVersion === SCHEMA_VERSION, "schemaVersion");
  req(isEnum(project.units, UNITS), "units");
  req(isTimestamp(project.createdAt) && isTimestamp(project.updatedAt), "createdAt/updatedAt (in-range timestamp)");
  req(isBoundedStr(project.generatorVersion), "generatorVersion");

  const board = project.board;
  req(isObj(board), "board");
  const b = board as Record<string, unknown>;
  req(isBoundedStr(b.id), "board.id");
  req(isBoundedStr(b.name) && isBoundedStr(b.revision), "board.name/revision");
  req(isValNum(b.thicknessMm), "board.thicknessMm");
  req(Array.isArray(b.holes) && (b.holes as unknown[]).length <= MAX_HOLES, "board.holes (count)");
  req(Array.isArray(b.keepOuts) && (b.keepOuts as unknown[]).length <= MAX_KEEPOUTS, "board.keepOuts (count)");
  (b.holes as unknown[]).forEach((h, i) => validateHole(h, `board.holes[${i}]`));
  (b.keepOuts as unknown[]).forEach((k, i) => validateKeepOut(k, `board.keepOuts[${i}]`));
  assertUniqueIds(b.holes as { id?: unknown }[], "board.holes");
  assertUniqueIds(b.keepOuts as { id?: unknown }[], "board.keepOuts");
  if (b.outline !== null && b.outline !== undefined) {
    req(isObj(b.outline), "board.outline");
    const o = b.outline as Record<string, unknown>;
    isValidRing(o.vertices, "board.outline.vertices");
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
    req(isBoundedStr(r.id) && isBoundedStr(r.assetName), "reference.strings");
    // The reference source is an untrusted URL that the canvas renders directly.
    req(isSafeReferenceSrc(r.src), "reference.src (must be a raster data URL or an app-relative asset path — remote schemes are rejected)");
    req(inBounds(r.widthPx) && (r.widthPx as number) > 0 && inBounds(r.heightPx) && (r.heightPx as number) > 0, "reference.dimensions");
    req(isNum(r.rotationDeg), "reference.rotationDeg");
    req(isTimestamp(r.addedAt), "reference.addedAt");
    req(r.missing === undefined || isBool(r.missing), "reference.missing");
    req(isObj(r.capture) && isBoundedStr((r.capture as Record<string, unknown>).label) && isEnum((r.capture as Record<string, unknown>).kind, CAPTURE_KINDS), "reference.capture");
  }
  if (project.calibration !== null && project.calibration !== undefined) {
    req(isObj(project.calibration), "calibration");
    const c = project.calibration as Record<string, unknown>;
    req(isBoundedStr(c.id), "calibration.id");
    req(Array.isArray(c.anchors) && (c.anchors as unknown[]).length === 2 && (c.anchors as unknown[]).every(isPointB), "calibration.anchors");
    req(isValNum(c.knownMm), "calibration.knownMm");
    req(isEnum(c.source, CAL_SOURCES), "calibration.source");
    req(isEnum(c.status, CAL_STATUS), "calibration.status");
    req(isTimestamp(c.createdAt), "calibration.createdAt");
    req(c.rejectReason === undefined || isBoundedStr(c.rejectReason), "calibration.rejectReason");
    req(c.rejectMessage === undefined || isBoundedStr(c.rejectMessage), "calibration.rejectMessage");
    req(c.pxPerMm === null || isNum(c.pxPerMm), "calibration.pxPerMm");
    if (c.status === "valid") {
      req(isNum(c.pxPerMm) && (c.pxPerMm as number) > 0, "calibration.pxPerMm (valid requires a positive scale)");
      // Re-run the SAME plausibility assessment the UI uses and derive the scale from the
      // anchors + known distance — a persisted `pxPerMm` is never trusted as authority
      // (reviewer #5). An imported file cannot smuggle in an implausible/arbitrary scale.
      const anchors = c.anchors as Pt[];
      const known = c.knownMm as { known: boolean; value?: unknown };
      req(known.known === true && isNum(known.value) && (known.value as number) > 0, "calibration.knownMm (valid requires a known positive distance)");
      const assessment = assessCalibration(anchors[0], anchors[1], known.value as number);
      req(assessment.valid && assessment.pxPerMm != null, "calibration (anchors + known distance imply an implausible or degenerate scale)");
      const derived = assessment.pxPerMm as number;
      req(Math.abs(derived - (c.pxPerMm as number)) <= PX_PER_MM_REL_TOL * derived + 1e-6, "calibration.pxPerMm (stored scale disagrees with the anchors and known distance)");
    }
  }

  if (project.generated !== null && project.generated !== undefined) {
    req(isObj(project.generated), "generated");
    validateGenerated(project.generated as Record<string, unknown>);
  }
  req(Array.isArray(project.exports) && (project.exports as unknown[]).length <= MAX_EXPORTS, "exports (count)");
  (project.exports as unknown[]).forEach((e, i) => validateExportRecord(e, `exports[${i}]`));
  assertUniqueIds(project.exports as { id?: unknown }[], "exports");
}
