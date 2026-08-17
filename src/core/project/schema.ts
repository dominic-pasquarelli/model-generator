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
  for (const key of ["id", "name", "board", "mount"] as const) {
    if (!(key in project)) {
      throw new MgFileError("MISSING_FIELD", `Project is missing required field \`${key}\`.`);
    }
  }
  return { schemaVersion: SCHEMA_VERSION, project };
}
