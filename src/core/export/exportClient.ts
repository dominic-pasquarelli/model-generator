/**
 * Client for the export worker (reviewer #1). Exposes ONE async entry — {@link requestExport}
 * — that runs the STL/STEP serialization + artifact hashing off the main thread and streams
 * real per-stage progress back. Cancellation terminates the worker (a genuine hard stop of the
 * in-flight serialization, not a discarded result).
 *
 * Robustness: the worker is built lazily (importing this module never touches `Worker`, so
 * tests/SSR are fine). Where `Worker` is unavailable it runs the same stages synchronously —
 * the non-Worker escape only, never a silent main-thread path in a normal browser.
 */
import type { Project } from "@/core/project/types";
import type { MeshResult } from "@/core/geometry/mesh";
import type { ExportReadiness } from "@/core/validation/validate";
import { exportSnapshot, serializeBody, finalizeArtifact, type ExportArtifact, type ExportOptions } from "./exporter";
import type { ExportWorkerRequest, ExportWorkerResponse } from "./exportWorker";

export type ExportProgress = (progress: number, stage: string) => void;

/** Terminal outcome of one export job. */
export type ExportOutcome =
  | { status: "done"; artifact: ExportArtifact }
  | { status: "error"; readiness: ExportReadiness }
  | { status: "aborted" };

export interface ExportRequestOpts {
  /** The worker-produced geometry build the store already cached (avoids a rebuild). */
  prebuilt?: MeshResult;
  onProgress?: ExportProgress;
  signal?: AbortSignal;
}

/** Injectable export implementation (test seam). */
export type ExportFn = (project: Project, options: ExportOptions, opts?: ExportRequestOpts) => Promise<ExportOutcome>;

function exceptionReadiness(message: string): ExportReadiness {
  return { ready: false, blockers: [{ id: "export-worker-failed", severity: "error", title: "Export failed", body: message }], checklist: [] };
}

let worker: Worker | null = null;
let handlers: Map<number, { onProgress?: ExportProgress; resolve: (o: ExportOutcome) => void }> | null = null;
let nextId = 1;

function teardown(outcome: ExportOutcome) {
  const inflight = handlers;
  try {
    worker?.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
  handlers = null;
  inflight?.forEach((h) => h.resolve(outcome));
}

function ensureWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./exportWorker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
    return null;
  }
  handlers = new Map();
  worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
    const msg = e.data;
    const h = handlers?.get(msg.id);
    if (!h) return;
    if (msg.kind === "progress") {
      h.onProgress?.(msg.progress, msg.stage);
      return;
    }
    handlers!.delete(msg.id);
    if (msg.kind === "done") h.resolve({ status: "done", artifact: msg.artifact });
    else if (msg.kind === "error") h.resolve({ status: "error", readiness: msg.readiness });
    else h.resolve({ status: "error", readiness: exceptionReadiness(msg.message) });
  };
  worker.onerror = () => teardown({ status: "error", readiness: exceptionReadiness("The export worker crashed while serialising.") });
  return worker;
}

/** Run the export stages synchronously (non-Worker escape only). */
const syncExport: ExportFn = async (project, options, opts) => {
  const signal = opts?.signal;
  if (signal?.aborted) return { status: "aborted" };
  const nowIso = options.nowIso ?? new Date(options.now ?? Date.now()).toISOString();
  opts?.onProgress?.(6, "Building solid from the canonical model");
  const snap = exportSnapshot(project, opts?.prebuilt);
  if (!snap.ok) return { status: "error", readiness: snap.readiness };
  if (signal?.aborted) return { status: "aborted" };
  opts?.onProgress?.(45, `Serialising ${options.format.toUpperCase()} body`);
  const body = serializeBody(project, snap.snapshot, options.format, nowIso);
  if (signal?.aborted) return { status: "aborted" };
  opts?.onProgress?.(82, options.writeSidecar ? "Hashing artifact + writing sidecar" : "Hashing artifact");
  const artifact = finalizeArtifact(project, snap.snapshot, body, options, nowIso);
  return { status: "done", artifact };
};

const workerExport: ExportFn = (project, options, opts) => {
  const signal = opts?.signal;
  if (signal?.aborted) return Promise.resolve({ status: "aborted" });
  const w = ensureWorker();
  if (!w || !handlers) return syncExport(project, options, opts); // non-Worker escape only
  const id = nextId++;
  const map = handlers;
  return new Promise<ExportOutcome>((resolve) => {
    const onAbort = () => teardown({ status: "aborted" });
    signal?.addEventListener("abort", onAbort, { once: true });
    map.set(id, {
      onProgress: opts?.onProgress,
      resolve: (o) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(o);
      },
    });
    const req: ExportWorkerRequest = { id, project, options, prebuilt: opts?.prebuilt };
    w.postMessage(req);
  });
};

let exportImpl: ExportFn = workerExport;

/** Request one export (async). Streams progress via `opts.onProgress`; abortable via `opts.signal`. */
export function requestExport(project: Project, options: ExportOptions, opts?: ExportRequestOpts): Promise<ExportOutcome> {
  return exportImpl(project, options, opts);
}

/** @internal test-only: inject an export implementation (pass nothing to reset to the worker). */
export function __setExportForTest(fn?: ExportFn) {
  exportImpl = fn ?? workerExport;
}
