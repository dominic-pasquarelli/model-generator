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
function isPoint(v: unknown): boolean {
  return isObj(v) && isNum(v.x) && isNum(v.y);
}
/** A Val<T>: either {known:false} or {known:true, value, source}. */
function isVal(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.known === false) return true;
  return v.known === true && "value" in v && isStr(v.source);
}
function req(cond: boolean, path: string): void {
  if (!cond) throw new MgFileError("INVALID_SHAPE", `Project field \`${path}\` is malformed.`);
}

export function validateProjectShape(project: Record<string, unknown>): void {
  req(isStr(project.id), "id");
  req(isStr(project.name), "name");
  req(isNum(project.version), "version");
  req(isNum(project.schemaVersion), "schemaVersion");
  req(Array.isArray(project.exports), "exports");

  const board = project.board;
  req(isObj(board), "board");
  const b = board as Record<string, unknown>;
  req(isStr(b.name), "board.name");
  req(isVal(b.thicknessMm), "board.thicknessMm");
  req(Array.isArray(b.holes), "board.holes");
  req(Array.isArray(b.keepOuts), "board.keepOuts");
  for (const [i, h] of (b.holes as unknown[]).entries()) {
    req(isObj(h), `board.holes[${i}]`);
    const hole = h as Record<string, unknown>;
    req(isStr(hole.id) && isStr(hole.label), `board.holes[${i}].id/label`);
    req(isPoint(hole.centerPx), `board.holes[${i}].centerPx`);
    req(isVal(hole.diameterMm), `board.holes[${i}].diameterMm`);
  }
  for (const [i, k] of (b.keepOuts as unknown[]).entries()) {
    req(isObj(k), `board.keepOuts[${i}]`);
    const ko = k as Record<string, unknown>;
    req(isStr(ko.id) && isStr(ko.shape), `board.keepOuts[${i}].id/shape`);
    req(isVal(ko.clearanceHeightMm), `board.keepOuts[${i}].clearanceHeightMm`);
  }
  if (b.outline !== null && b.outline !== undefined) {
    req(isObj(b.outline), "board.outline");
    const o = b.outline as Record<string, unknown>;
    req(Array.isArray(o.vertices) && (o.vertices as unknown[]).every(isPoint), "board.outline.vertices");
    req(isVal(o.cornerRadiusMm), "board.outline.cornerRadiusMm");
  }

  const mount = project.mount;
  req(isObj(mount), "mount");
  const m = mount as Record<string, unknown>;
  req(isStr(m.kind), "mount.kind");
  for (const f of ["standoffHeightMm", "baseThicknessMm", "bossDiameterMm", "clearanceMm"]) {
    req(isVal(m[f]), `mount.${f}`);
  }

  if (project.reference !== null && project.reference !== undefined) {
    req(isObj(project.reference), "reference");
    const r = project.reference as Record<string, unknown>;
    req(isStr(r.src) && isNum(r.widthPx) && isNum(r.heightPx), "reference.src/dimensions");
  }
  if (project.calibration !== null && project.calibration !== undefined) {
    req(isObj(project.calibration), "calibration");
    const c = project.calibration as Record<string, unknown>;
    req(Array.isArray(c.anchors) && (c.anchors as unknown[]).every(isPoint), "calibration.anchors");
    req(isStr(c.status), "calibration.status");
  }
}
