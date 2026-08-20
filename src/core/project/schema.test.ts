import { describe, it, expect } from "vitest";
import { createProject, migrateData, MgFileError, parseProjectFile, serializeProject } from "./schema";
import { createSampleProject } from "./fixtures";
import { SCHEMA_VERSION } from "./types";
import { isKnown } from "./value";

/** A valid, fully-populated sample project with exactly one field corrupted. */
function corruptFile(mutate: (p: Record<string, any>, file: Record<string, any>) => void): string {
  const file = JSON.parse(serializeProject(createSampleProject(1)));
  mutate(file.project, file);
  return JSON.stringify(file);
}

describe("createProject", () => {
  it("starts thickness unknown (never zero)", () => {
    const p = createProject({ name: "demo", now: 1000 });
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(isKnown(p.board.thicknessMm)).toBe(false);
    expect(p.reference).toBeNull();
    expect(p.calibration).toBeNull();
    expect(p.board.holes).toHaveLength(0);
  });

  it("names default sensibly and trims", () => {
    expect(createProject({ name: "  hi  " }).name).toBe("hi");
    expect(createProject({}).name).toBe("untitled-mount");
  });
});

describe("serialize / load round-trip", () => {
  it("survives JSON round-trip with meaning intact", () => {
    const p = createProject({ name: "rt", now: 42 });
    const text = serializeProject(p);
    const { project } = parseProjectFile(text);
    expect(project.name).toBe("rt");
    expect(project.mount.kind).toBe("plate-standoffs");
    expect(isKnown(project.board.thicknessMm)).toBe(false);
  });
});

describe("migrations", () => {
  it("upgrades a pre-versioned v0 file to v1 with a default mount", () => {
    const v0 = {
      project: { id: "x", name: "old", board: { id: "b", holes: [], keepOuts: [] } },
    };
    const migrated = migrateData(v0 as never) as { schemaVersion: number; project: Record<string, unknown> };
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.project.mount).toBeTruthy();
    expect(migrated.project.version).toBe(1);
  });

  it("rejects a future schema version", () => {
    expect(() => migrateData({ schemaVersion: 99, project: {} } as never)).toThrow(MgFileError);
  });
});

describe("corrupt file handling", () => {
  it("throws a diagnosable error on invalid JSON", () => {
    expect(() => parseProjectFile("{not json")).toThrow(/valid JSON/);
  });

  it("throws when the project payload is missing", () => {
    expect(() => parseProjectFile(JSON.stringify({ schemaVersion: 1 }))).toThrow(MgFileError);
  });

  it("throws when a required field is absent", () => {
    const bad = JSON.stringify({ schemaVersion: 1, project: { id: "x", name: "y" } });
    expect(() => parseProjectFile(bad)).toThrow(MgFileError);
  });

  it("rejects a structurally malformed nested field (board: null)", () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      project: {
        id: "x",
        name: "y",
        version: 1,
        schemaVersion: 1,
        units: "mm",
        createdAt: 0,
        updatedAt: 0,
        generatorVersion: "v",
        exports: [],
        board: null,
        mount: {},
      },
    });
    expect(() => parseProjectFile(bad)).toThrow(/board/);
  });

  it("rejects a hole with no centerPx", () => {
    const p = createProject({ name: "z" });
    const raw = JSON.parse(serializeProject(p));
    raw.project.board.holes = [{ id: "h", label: "H1", diameterMm: { known: false } }];
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(/centerPx/);
  });
});

describe("import boundary rejects malformed .mgproj data (untrusted input)", () => {
  it("accepts a round-tripped valid project", () => {
    expect(() => parseProjectFile(corruptFile(() => {}))).not.toThrow();
  });

  const cases: Array<[string, (p: Record<string, any>, file: Record<string, any>) => void, RegExp]> = [
    ["a string-valued numeric Val", (p) => (p.mount.standoffHeightMm = { known: true, value: "6", source: "measured" }), /standoffHeightMm/],
    ["a NaN-inducing known Val", (p) => (p.board.thicknessMm = { known: true, value: "not-a-number", source: "measured" }), /thicknessMm/],
    ["an invalid unit", (p) => (p.units = "furlong"), /units/],
    ["an invalid provenance source", (p) => (p.board.holes[0].diameterMm = { known: true, value: 3, source: "guessed" }), /diameterMm/],
    ["an unsupported mount strategy", (p) => (p.mount.kind = "levitation"), /kind/],
    ["an unsupported fastener style", (p) => (p.mount.fastenerStyle = "glue"), /fastenerStyle/],
    ["an unsupported tolerance profile", (p) => (p.mount.tolerance = "fdm-9.99"), /tolerance/],
    ["an invalid sideTabs count", (p) => (p.mount.sideTabs = 3), /sideTabs/],
    ["a mismatched top-level/project schema version", (_p, file) => (file.project.schemaVersion = 2), /SCHEMA_MISMATCH|schema/],
    ["a malformed generated record", (p) => (p.generated = { sourceVersion: 1, key: "k", paramsHash: "h", dims: {}, warnings: [], createdAt: 0, durationMs: null }), /generated/],
    ["a malformed export record", (p) => (p.exports = [{ id: "e" }]), /exports/],
    ["a calibration marked valid with no scale", (p) => ((p.calibration.status = "valid"), (p.calibration.pxPerMm = null)), /pxPerMm/],
    ["an invalid calibration status", (p) => (p.calibration.status = "kinda"), /calibration.status/],
    ["a keep-out whose discriminator and payload disagree", (p) => (p.board.keepOuts[0].shape = "circle"), /circlePx/],
  ];

  for (const [label, mutate, pattern] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parseProjectFile(corruptFile(mutate))).toThrow(MgFileError);
      expect(() => parseProjectFile(corruptFile(mutate))).toThrow(pattern);
    });
  }
});
