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
    // ---- resource / cross-field / trust-boundary invariants (reviewer #5) ----
    ["a remote reference src (would fire an off-origin request)", (p) => (p.reference.src = "https://evil.example/track.png"), /reference\.src/],
    ["a protocol-relative reference src", (p) => (p.reference.src = "//evil.example/x.png"), /reference\.src/],
    ["a javascript: reference src", (p) => (p.reference.src = "javascript:alert(1)"), /reference\.src/],
    ["a tampered calibration scale that disagrees with the anchors", (p) => (p.calibration.pxPerMm = 25), /pxPerMm/],
    ["a calibration whose anchors imply an implausible scale", (p) => (p.calibration.anchors = [{ x: 100, y: 100 }, { x: 101, y: 100 }]), /calibration/],
    ["a self-intersecting board outline", (p) => (p.board.outline.vertices = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]), /outline\.vertices/],
    ["a duplicate hole id", (p) => (p.board.holes[1].id = p.board.holes[0].id), /duplicate id/],
    ["a non-positive keep-out rectangle", (p) => (p.board.keepOuts[0].rectPx.w = 0), /non-positive/],
    ["an out-of-bounds hole coordinate", (p) => (p.board.holes[0].centerPx = { x: 1e9, y: 0 }), /centerPx/],
  ];

  for (const [label, mutate, pattern] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parseProjectFile(corruptFile(mutate))).toThrow(MgFileError);
      expect(() => parseProjectFile(corruptFile(mutate))).toThrow(pattern);
    });
  }

  it("accepts a raster data-URL reference (a supported local image)", () => {
    const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    expect(() => parseProjectFile(corruptFile((p) => (p.reference.src = tiny)))).not.toThrow();
  });

  it("rejects a file larger than the size limit before parsing", () => {
    const huge = " ".repeat(12_000_001);
    expect(() => parseProjectFile(huge)).toThrow(/FILE_TOO_LARGE|larger than/);
  });

  it("rejects a top-level/project schema disagreement BEFORE migration erases it", () => {
    // Top-level v0 marker paired with a project v1 marker: the raw check must catch it.
    const file = JSON.stringify({ schemaVersion: 0, project: { schemaVersion: 1, id: "x", name: "y" } });
    expect(() => parseProjectFile(file)).toThrow(/SCHEMA_MISMATCH|schema/);
  });
});

describe("numeric + structural import invariants (reviewer #4)", () => {
  /** A fully-valid generated record, so a corruption isolates the field under test. */
  function validGenerated() {
    return {
      sourceVersion: 1,
      key: "k",
      paramsHash: "h",
      dims: { widthMm: 85, depthMm: 56, heightMm: 9, standoffCount: 4, bodies: 1, triangles: 100 },
      warnings: [],
      createdAt: 0,
      durationMs: null,
    };
  }

  const MAX_SAFE = Number.MAX_SAFE_INTEGER; // 2^53 - 1
  const UNSAFE = MAX_SAFE + 1; // 2^53 — `v + 1` no longer advances

  const cases: Array<[string, (p: Record<string, any>, file: Record<string, any>) => void, RegExp]> = [
    // ---- safe-integer versions/counts ----
    ["a project version at the unsafe-integer ceiling (2^53)", (p) => (p.version = UNSAFE), /version/],
    ["a fractional project version", (p) => (p.version = 1.5), /version/],
    ["an unsafe generated sourceVersion", (p) => (p.generated = { ...validGenerated(), sourceVersion: UNSAFE }), /generated/],
    ["a negative generated standoffCount", (p) => (p.generated = { ...validGenerated(), dims: { ...validGenerated().dims, standoffCount: -1 } }), /standoffCount/],
    ["a fractional generated bodies count", (p) => (p.generated = { ...validGenerated(), dims: { ...validGenerated().dims, bodies: 1.5 } }), /bodies/],
    ["an unsafe export sizeBytes", (p) => (p.exports = [{ id: "e", fileName: "f", paramsHash: "h", generationKey: "g", format: "stl", sizeBytes: UNSAFE, createdAt: 0, wroteSidecar: false }]), /sizeBytes|numbers/],
    // ---- timestamp range ----
    ["a negative generated createdAt", (p) => (p.generated = { ...validGenerated(), createdAt: -1 }), /createdAt/],
    ["an absurd far-future generated createdAt", (p) => (p.generated = { ...validGenerated(), createdAt: 32_503_680_000_001 }), /createdAt/],
    ["a negative project updatedAt", (p) => (p.updatedAt = -5), /updatedAt/],
    ["an out-of-range project createdAt", (p) => (p.createdAt = 9e18), /createdAt/],
    ["a negative reference.addedAt", (p) => (p.reference.addedAt = -1), /addedAt/],
    ["a bad calibration.createdAt", (p) => (p.calibration.createdAt = -1), /calibration\.createdAt/],
    // ---- structural: board.id / reference.missing / calibration.reject* ----
    ["a missing board.id", (p) => delete p.board.id, /board\.id/],
    ["a non-string board.id", (p) => (p.board.id = 42), /board\.id/],
    ["a non-boolean reference.missing", (p) => (p.reference.missing = "yes"), /reference\.missing/],
    ["a non-string calibration.rejectReason", (p) => (p.calibration.rejectReason = 7), /rejectReason/],
    // ---- oversized collections ----
    ["oversized generated warnings", (p) => (p.generated = { ...validGenerated(), warnings: Array.from({ length: 501 }, () => "w") }), /warnings/],
    // ---- extraneous keep-out payload (shape preserved) ----
    ["a rect keep-out carrying a stale circlePx", (p) => (p.board.keepOuts[0].circlePx = { center: { x: 1, y: 1 }, radiusPx: 5 }), /circlePx|extraneous/],
  ];

  for (const [label, mutate, pattern] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parseProjectFile(corruptFile(mutate))).toThrow(MgFileError);
      expect(() => parseProjectFile(corruptFile(mutate))).toThrow(pattern);
    });
  }

  it("rejects a string-valued top-level schemaVersion even when the project marker is valid", () => {
    const file = JSON.stringify({ schemaVersion: "1", project: JSON.parse(serializeProject(createSampleProject(1))) });
    expect(() => parseProjectFile(file)).toThrow(MgFileError);
    expect(() => parseProjectFile(file)).toThrow(/SCHEMA_MISMATCH|number/);
  });

  it("accepts a project version just below the safe-integer ceiling", () => {
    const ok = corruptFile((p) => (p.version = MAX_SAFE - 1));
    expect(() => parseProjectFile(ok)).not.toThrow();
  });

  it("accepts a valid generated record with in-range integer counts and timestamp", () => {
    const ok = corruptFile((p) => (p.generated = validGenerated()));
    expect(() => parseProjectFile(ok)).not.toThrow();
  });
});

describe("v0 migration opens end-to-end through parseProjectFile (reviewer #5)", () => {
  it("a realistic pre-mount-strategy v0 file opens with a default mount and passes shape validation", () => {
    const v0 = JSON.stringify({
      project: {
        id: "old-proj",
        name: "legacy",
        units: "mm",
        createdAt: 10,
        updatedAt: 20,
        generatorVersion: "legacy",
        board: { id: "b", name: "OLD", revision: "a", thicknessMm: { known: false }, outline: null, holes: [], keepOuts: [] },
      },
    });
    const { project } = parseProjectFile(v0);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.mount.kind).toBe("plate-standoffs");
    expect(project.exports).toEqual([]);
  });

  it("even a sparse v0 file (only id/name/board) opens through parseProjectFile", () => {
    const v0 = JSON.stringify({ project: { id: "x", name: "old", board: { id: "b", holes: [], keepOuts: [] } } });
    expect(() => parseProjectFile(v0)).not.toThrow();
  });
});
