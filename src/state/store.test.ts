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
  useStore.setState({ current: null, saveState: "idle", lastSavedAt: null, lastSaveError: null });
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
