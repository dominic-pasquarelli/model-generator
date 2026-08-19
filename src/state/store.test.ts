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
