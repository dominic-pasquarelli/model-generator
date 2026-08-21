/**
 * Worker-backed geometry adapter (reviewer #3). Runs {@link generateModelSync} inside a
 * dedicated Web Worker so a long generation keeps the main thread — and therefore the whole
 * UI — responsive, and supports GENUINE cancellation: aborting the passed {@link AbortSignal}
 * `terminate()`s the worker (a hard stop of the in-flight synchronous computation, the only
 * way to interrupt a busy worker) and a fresh worker is created lazily for the next request.
 *
 * Robustness: the worker is constructed lazily on first use, so importing this module never
 * touches the `Worker` global (tests / SSR). Where `Worker` is unavailable, or if the worker
 * fails to construct or crashes, generation falls back to the synchronous solid generator, so
 * this adapter is never worse than the main-thread one.
 */
import type { Project } from "@/core/project/types";
import { ACTIVE_ADAPTER_VERSION, type GenerateResult, type GeometryAdapter } from "./adapter";
import { solidGenerator } from "./solidGenerator";
import type { WorkerRequest, WorkerResponse } from "./geometryWorker";

let worker: Worker | null = null;
let pending: Map<number, (r: GenerateResult) => void> | null = null;
let nextId = 1;

/** Tear down the worker and settle every in-flight request with `result`. */
function teardown(result: GenerateResult) {
  const inflight = pending;
  try {
    worker?.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
  pending = null;
  inflight?.forEach((resolve) => resolve(result));
}

/** Lazily build (or reuse) the worker. Returns null when Workers are unavailable. */
function ensureWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./geometryWorker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
    return null;
  }
  pending = new Map();
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { id, ...result } = e.data;
    const resolve = pending?.get(id);
    if (resolve) {
      pending!.delete(id);
      resolve(result as GenerateResult);
    }
  };
  worker.onerror = () => {
    // A worker-level crash settles all in-flight requests with a diagnosable error and drops
    // the worker so the next call rebuilds it.
    teardown({ ok: false, error: { code: "WORKER_ERROR", message: "The geometry worker crashed while generating." } });
  };
  return worker;
}

export const workerGenerator: GeometryAdapter = {
  name: ACTIVE_ADAPTER_VERSION,
  capabilities: solidGenerator.capabilities,
  generate(project: Project, signal?: AbortSignal): Promise<GenerateResult> {
    if (signal?.aborted) return Promise.resolve({ ok: false, error: { code: "ABORTED", message: "Generation cancelled." } });
    const w = ensureWorker();
    if (!w || !pending) return solidGenerator.generate(project, signal); // no Worker → synchronous fallback
    const id = nextId++;
    const map = pending;
    return new Promise<GenerateResult>((resolve) => {
      // On abort, terminate the worker (hard-cancel the busy computation) and settle every
      // in-flight request — including this one — as ABORTED. The store runs one generation at
      // a time, so tearing the worker down on abort cannot strand an unrelated request.
      const onAbort = () => teardown({ ok: false, error: { code: "ABORTED", message: "Generation cancelled." } });
      signal?.addEventListener("abort", onAbort, { once: true });
      map.set(id, (r) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(r);
      });
      const req: WorkerRequest = { id, project };
      w.postMessage(req);
    });
  },
};

/** @internal test-only: force the next generate() to rebuild the worker. */
export function __resetWorkerForTest() {
  teardown({ ok: false, error: { code: "ABORTED", message: "reset" } });
  nextId = 1;
}
