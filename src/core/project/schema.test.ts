import { describe, it, expect } from "vitest";
import { createProject, migrateData, MgFileError, parseProjectFile, serializeProject } from "./schema";
import { SCHEMA_VERSION } from "./types";
import { isKnown } from "./value";

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
      project: { id: "x", name: "y", version: 1, schemaVersion: 1, exports: [], board: null, mount: {} },
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
