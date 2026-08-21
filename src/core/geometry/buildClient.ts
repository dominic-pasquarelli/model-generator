/**
 * Client for the geometry build worker (reviewer #1). Exposes ONE async entry — `requestBuild`
 * — that runs the full {@link buildBracketMesh} off the main thread and returns the immutable
 * result. The store caches results by generation key so preview, validation, and export all
 * consume the SAME worker-produced build instead of each recomputing it synchronously.
 *
 * Robustness: the worker is built lazily (importing this module never touches `Worker`, so tests
 * and SSR are fine). Where `Worker` is genuinely unavailable it falls back to a synchronous
 * build — this is NOT a silent main-thread path in a normal browser, only the non-Worker escape.
 * Cancellation terminates the worker (a real hard stop of the in-flight build).
 */
import type { Project } from "@/core/project/types";
import { buildBracketMesh, type MeshResult } from "./mesh";
import type { WorkerRequest, WorkerResponse } from "./geometryWorker";

/** Injectable build implementation (test seam). */
export type BuildFn = (project: Project, signal?: AbortSignal) => Promise<MeshResult>;

let worker: Worker | null = null;
let pending: Map<number, (r: MeshResult) => void> | null = null;
let nextId = 1;

function teardown(result: MeshResult) {
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
    const { id, result } = e.data;
    const resolve = pending?.get(id);
    if (resolve) {
      pending!.delete(id);
      resolve(result);
    }
  };
  worker.onerror = () => teardown({ ok: false, error: { code: "WORKER_ERROR", message: "The geometry worker crashed while building." } });
  return worker;
}

/** Run the full build in the worker (or synchronously where Worker is unavailable). */
const workerBuild: BuildFn = (project, signal) => {
  if (signal?.aborted) return Promise.resolve({ ok: false, error: { code: "ABORTED", message: "Build cancelled." } });
  const w = ensureWorker();
  if (!w || !pending) return Promise.resolve(buildBracketMesh(project)); // non-Worker escape only
  const id = nextId++;
  const map = pending;
  return new Promise<MeshResult>((resolve) => {
    const onAbort = () => teardown({ ok: false, error: { code: "ABORTED", message: "Build cancelled." } });
    signal?.addEventListener("abort", onAbort, { once: true });
    map.set(id, (r) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(r);
    });
    const req: WorkerRequest = { id, project };
    w.postMessage(req);
  });
};

let buildImpl: BuildFn = workerBuild;

/** Request one geometry build (async). Deduplication + caching by key is the store's job. */
export function requestBuild(project: Project, signal?: AbortSignal): Promise<MeshResult> {
  return buildImpl(project, signal);
}

/** @internal test-only: inject a build implementation (pass nothing to reset to the worker). */
export function __setBuildForTest(fn?: BuildFn) {
  buildImpl = fn ?? workerBuild;
}
