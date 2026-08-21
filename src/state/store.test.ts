// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARDS_KEY,
  RECOVERY_KEY,
  STORAGE_KEY,
  loadLibrary,
  loadSavedBoards,
  useStore,
  __setGeneratorForTest,
} from "./store";
import { createSampleProject } from "@/core/project/fixtures";
import { serializeProject, createProject } from "@/core/project/schema";
import { isCurrentModelExported, isGenerationCurrent } from "@/core/project/derive";
import { mockGenerator } from "@/core/geometry/mockGenerator";
import { isKnown } from "@/core/project/value";
import type { GeometryAdapter } from "@/core/geometry/adapter";

function openSample() {
  const p = createSampleProject(1);
  useStore.setState((s) => ({ current: p, projects: [p, ...s.projects.filter((x) => x.id !== p.id)] }));
  return p;
}

beforeEach(() => {
  localStorage.clear();
  __setGeneratorForTest();
  vi.useRealTimers();
  useStore.setState({ current: null, saveState: "idle", lastSavedAt: null, lastSaveError: null, past: [], future: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  __setGeneratorForTest();
});

describe("loadLibrary resilience", () => {
  it("preserves malformed whole-library JSON under a recovery key and seeds", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const lib = loadLibrary();
    expect(lib.length).toBeGreaterThan(0); // seeded, not empty
    expect(localStorage.getItem(RECOVERY_KEY)).toBe("{not json");
  });

  it("keeps valid projects when one entry is malformed, quarantining the bad one", () => {
    const good = JSON.parse(serializeProject(createProject({ name: "good", now: 1 }))).project;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([good, { id: "x", board: null }]));
    const lib = loadLibrary();
    expect(lib).toHaveLength(1);
    expect(lib[0].name).toBe("good");
    expect(localStorage.getItem(RECOVERY_KEY)).toContain('"id":"x"');
  });

  it("respects a deliberately empty library (does not re-seed)", () => {
    localStorage.setItem(STORAGE_KEY, "[]");
    expect(loadLibrary()).toHaveLength(0);
  });
});

describe("persistence save state", () => {
  it("reports an error save state on QuotaExceededError (no silent swallow)", () => {
    openSample();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    useStore.getState().setBoardName("x");
    expect(useStore.getState().saveState).toBe("error");
    expect(useStore.getState().lastSaveError).toMatch(/full/i);
    spy.mockRestore();
  });

  it("reports saved after a successful write", () => {
    openSample();
    useStore.getState().setBoardName("renamed");
    expect(useStore.getState().saveState).toBe("saved");
    expect(useStore.getState().lastSavedAt).not.toBeNull();
  });
});

describe("saved board library is durable", () => {
  it("persists and reloads a saved board", () => {
    openSample();
    const res = useStore.getState().saveBoardToLibrary();
    expect(res.ok).toBe(true);
    expect(localStorage.getItem(BOARDS_KEY)).toBeTruthy();
    const reloaded = loadSavedBoards();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].board.holes.length).toBe(4);
  });
});

describe("keep-out shape change consistency", () => {
  it("materialises circle geometry and clears the rectangle when the shape changes", () => {
    const p = openSample();
    const ko = p.board.keepOuts[0];
    useStore.getState().updateKeepOut(ko.id, { shape: "circle" });
    const updated = useStore.getState().current!.board.keepOuts.find((k) => k.id === ko.id)!;
    expect(updated.shape).toBe("circle");
    expect(updated.circlePx).toBeTruthy();
    expect(updated.rectPx).toBeUndefined();
  });
});

describe("generation freshness under async races", () => {
  it("discards a stale generation whose model changed during the async run", async () => {
    // A delayed adapter we release manually.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const delayed: GeometryAdapter = {
      name: "delayed",
      capabilities: { exactSolid: false, previewMesh: false },
      async generate(project, signal) {
        await gate;
        return mockGenerator.generate(project, signal);
      },
    };
    __setGeneratorForTest(delayed);

    const p = openSample();
    useStore.setState((s) => ({ ui: { ...s.ui, autoGenerate: false } }));
    expect(p.generated).toBeNull();

    const gp = useStore.getState().generate(); // captures the pre-edit model, then blocks
    // Edit the model while generation is in flight (changes the generation key).
    useStore.getState().setThicknessMm(9.87);
    release();
    await gp;

    // The result computed from the OLD model must not have been attached.
    expect(useStore.getState().current!.generated ?? null).toBeNull();
    expect(isGenerationCurrent(useStore.getState().current!)).toBe(false);
  });
});

describe("units toggle is display-only", () => {
  it("does not bump the model version, add an undo entry, or invalidate the generation", async () => {
    const p = openSample();
    useStore.setState((s) => ({ current: p, ui: { ...s.ui, autoGenerate: true } }));
    await useStore.getState().generate();
    expect(isGenerationCurrent(useStore.getState().current!)).toBe(true);

    const version = useStore.getState().current!.version;
    const pastLen = useStore.getState().past.length;
    useStore.getState().setUnits("inch");

    const st = useStore.getState();
    expect(st.current!.units).toBe("inch");
    expect(st.current!.version).toBe(version); // no model-version bump
    expect(st.past.length).toBe(pastLen); // no undo snapshot
    expect(isGenerationCurrent(st.current!)).toBe(true); // generation stays current
  });
});

describe("undo / redo", () => {
  it("steps backward and forward through edits and drops redo on a new edit", () => {
    openSample();
    useStore.setState((s) => ({ ui: { ...s.ui, autoGenerate: false } }));
    const thick = () => {
      const t = useStore.getState().current!.board.thicknessMm;
      return isKnown(t) ? t.value : null;
    };

    useStore.getState().setThicknessMm(2);
    useStore.getState().setThicknessMm(3);
    expect(thick()).toBe(3);
    expect(useStore.getState().past.length).toBe(2);

    useStore.getState().undo();
    expect(thick()).toBe(2);
    useStore.getState().undo();
    expect(thick()).toBe(1.6); // sample's original measured thickness
    expect(useStore.getState().past.length).toBe(0);

    useStore.getState().redo();
    expect(thick()).toBe(2);

    // A fresh edit after undo clears the redo stack.
    useStore.getState().undo(); // back to 1.6
    useStore.getState().setThicknessMm(5);
    expect(useStore.getState().future.length).toBe(0);
    expect(thick()).toBe(5);
  });
});

describe("undo/redo preserve a monotonic version and correct freshness", () => {
  it("every transition strictly increases version and never reuses one (edit→edit→undo→redo→undo→branch)", () => {
    openSample();
    useStore.setState((s) => ({ ui: { ...s.ui, autoGenerate: false } }));
    const seen: number[] = [];
    let prev = { v: useStore.getState().current!.version, t: useStore.getState().current!.updatedAt };
    seen.push(prev.v);
    const check = () => {
      const c = useStore.getState().current!;
      expect(c.version, "version strictly increases").toBeGreaterThan(prev.v);
      expect(c.updatedAt, "timestamp moves forward").toBeGreaterThanOrEqual(prev.t);
      seen.push(c.version);
      prev = { v: c.version, t: c.updatedAt };
    };
    useStore.getState().setThicknessMm(2);
    check();
    useStore.getState().setThicknessMm(3);
    check();
    useStore.getState().undo();
    check();
    useStore.getState().redo();
    check();
    useStore.getState().undo();
    check();
    useStore.getState().setThicknessMm(9); // branch edit after undo
    check();
    // No two transitions share a version → two states can never share an export filename.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("undo restores generation currency by key (not by a snapshot flag)", async () => {
    const p = openSample();
    useStore.setState((s) => ({ current: p, ui: { ...s.ui, autoGenerate: true } }));
    await useStore.getState().generate();
    expect(isGenerationCurrent(useStore.getState().current!)).toBe(true);
    useStore.setState((s) => ({ ui: { ...s.ui, autoGenerate: false } }));
    useStore.getState().setThicknessMm(7.77); // changes the geometry key → stale
    expect(isGenerationCurrent(useStore.getState().current!)).toBe(false);
    useStore.getState().undo(); // restores the previously-generated geometry
    expect(isGenerationCurrent(useStore.getState().current!)).toBe(true);
  });
});

describe("project file import/export", () => {
  it("round-trips a serialized project back into the library with a fresh id on collision", () => {
    const p = openSample();
    const text = serializeProject(useStore.getState().current!);
    const before = useStore.getState().projects.length;
    const res = useStore.getState().importProjectFile(text);
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();
    expect(res.id).not.toBe(p.id); // colliding id was reassigned, nothing clobbered
    expect(useStore.getState().projects.length).toBe(before + 1);
    expect(useStore.getState().current!.board.holes.length).toBe(4);
    expect(useStore.getState().route).toEqual({ view: "designer", projectId: res.id });
  });

  it("rejects a non-project file with a diagnosable error and no library change", () => {
    openSample();
    const before = useStore.getState().projects.length;
    const res = useStore.getState().importProjectFile("{not a project");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/INVALID_JSON|not/i);
    expect(useStore.getState().projects.length).toBe(before);
  });

  it("import is transactional: a quota failure does not open or route to the project (reviewer #5)", () => {
    const p = openSample();
    const text = serializeProject(useStore.getState().current!);
    // Land on the library screen, then simulate a full quota during the import write.
    useStore.setState({ route: { view: "library" }, current: null });
    const before = useStore.getState().projects.length;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const res = useStore.getState().importProjectFile(text);
    spy.mockRestore();

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/full|save|storage/i);
    // No false "opened and saved": not routed, no current, not added to the library.
    expect(useStore.getState().route).toEqual({ view: "library" });
    expect(useStore.getState().current).toBeNull();
    expect(useStore.getState().projects.length).toBe(before);
    expect(useStore.getState().saveState).toBe("error");
    void p;
  });
});

describe("export is recorded only on download", () => {
  it("prepares an artifact without a history record; records only after download; edit un-currents it", async () => {
    const p = openSample();
    useStore.setState((s) => ({ current: p, ui: { ...s.ui, autoGenerate: true } }));
    await useStore.getState().generate();
    expect(isGenerationCurrent(useStore.getState().current!)).toBe(true);

    vi.useFakeTimers();
    useStore.getState().runExport();
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    const afterRun = useStore.getState();
    expect(afterRun.ui.export.phase).toBe("complete");
    expect(afterRun.ui.export.artifact).toBeTruthy();
    // Prepared in memory only — no history record yet.
    expect(afterRun.current!.exports).toHaveLength(0);
    expect(isCurrentModelExported(afterRun.current!)).toBe(false);

    useStore.getState().commitExportDownload();
    expect(useStore.getState().current!.exports).toHaveLength(1);
    expect(isCurrentModelExported(useStore.getState().current!)).toBe(true);

    // Editing after export means the current model is no longer the exported one.
    useStore.getState().setThicknessMm(3.21);
    expect(isCurrentModelExported(useStore.getState().current!)).toBe(false);
  });
});

describe("undo/redo preserve the append-only export ledger (reviewer #4)", () => {
  function commitAnExport() {
    vi.useFakeTimers();
    useStore.getState().runExport();
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();
    useStore.getState().commitExportDownload();
  }

  it("edit → generate → export → undo keeps the export record; redo keeps it exactly once", async () => {
    const p = openSample();
    useStore.setState((s) => ({ current: p, ui: { ...s.ui, autoGenerate: true } }));
    useStore.getState().setThicknessMm(1.7); // a design edit (creates an undo step)
    await useStore.getState().generate();
    commitAnExport();
    expect(useStore.getState().current!.exports).toHaveLength(1);
    const recId = useStore.getState().current!.exports[0].id;

    useStore.getState().undo(); // undo the design edit
    expect(useStore.getState().current!.exports.map((e) => e.id), "export history survives undo").toEqual([recId]);

    useStore.getState().redo();
    expect(useStore.getState().current!.exports.map((e) => e.id), "still present exactly once after redo").toEqual([recId]);
  });

  it("keeps every export across multiple edits and undos", async () => {
    const p = openSample();
    useStore.setState((s) => ({ current: p, ui: { ...s.ui, autoGenerate: true } }));

    useStore.getState().setThicknessMm(1.7);
    await useStore.getState().generate();
    commitAnExport(); // export #1

    useStore.getState().setThicknessMm(1.9);
    await useStore.getState().generate();
    commitAnExport(); // export #2 (a different model)

    expect(useStore.getState().current!.exports).toHaveLength(2);
    const ids = new Set(useStore.getState().current!.exports.map((e) => e.id));

    useStore.getState().undo();
    useStore.getState().undo();
    // Both records survive undoing back past both design edits.
    expect(new Set(useStore.getState().current!.exports.map((e) => e.id))).toEqual(ids);
    expect(useStore.getState().current!.exports).toHaveLength(2);
  });

  it("undo snapshots carry no export ledger (append-only data is excluded from history)", async () => {
    const p = openSample();
    useStore.setState((s) => ({ current: p, ui: { ...s.ui, autoGenerate: true } }));
    useStore.getState().setThicknessMm(1.7);
    await useStore.getState().generate();
    commitAnExport();
    // The stored pre-edit snapshot is semantic-only: it must not carry the export ledger.
    const past = useStore.getState().past;
    expect(past.length).toBeGreaterThan(0);
    expect(past[past.length - 1].exports).toEqual([]);
  });
});

describe("import invariants at numeric extremes (reviewer #4)", () => {
  /** Import a valid sample project after overriding one or more top-level fields. */
  function importWith(mutateFile: (proj: Record<string, any>) => void) {
    const file = JSON.parse(serializeProject(createSampleProject(1)));
    mutateFile(file.project);
    const res = useStore.getState().importProjectFile(JSON.stringify(file));
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
  }

  it("an edit after importing a future-dated project never moves the timestamp backward", () => {
    const FUTURE = 2_500_000_000_000; // ~2049: after real Date.now(), within the year-3000 cap
    importWith((proj) => (proj.updatedAt = FUTURE));
    expect(useStore.getState().current!.updatedAt).toBe(FUTURE);
    useStore.getState().setThicknessMm(2.5);
    // The edit stamp is anchored on the imported updatedAt, so it moves forward, not back to now.
    expect(useStore.getState().current!.updatedAt).toBeGreaterThan(FUTURE);
  });

  it("edit → undo → redo stays monotonic and unique when imported near the safe-integer ceiling", () => {
    importWith((proj) => (proj.version = Number.MAX_SAFE_INTEGER - 10));
    useStore.setState((s) => ({ ui: { ...s.ui, autoGenerate: false } }));
    const seen = [useStore.getState().current!.version];
    const record = () => seen.push(useStore.getState().current!.version);
    useStore.getState().setThicknessMm(2);
    record();
    useStore.getState().setThicknessMm(3);
    record();
    useStore.getState().undo();
    record();
    useStore.getState().redo();
    record();
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(new Set(seen).size, "no two states share a version → never a duplicate export filename").toBe(seen.length);
    expect(seen.every(Number.isSafeInteger)).toBe(true);
  });

  it("the version counter fails loudly at the ceiling rather than silently duplicating", () => {
    importWith((proj) => (proj.version = Number.MAX_SAFE_INTEGER)); // safe int → passes import
    // The next bump would be 2^53, where `v + 1` no longer advances: throw, never duplicate.
    expect(() => useStore.getState().setThicknessMm(2)).toThrow(/overflow/i);
  });
});
