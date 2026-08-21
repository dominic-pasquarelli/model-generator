/**
 * Dedicated Web Worker that runs geometry generation OFF the main thread (reviewer #3).
 *
 * The store posts the canonical {@link Project} here; this worker runs the same synchronous
 * {@link generateModelSync} core the main-thread adapter uses and posts back the resulting
 * metadata. Because the heavy `buildBracketMesh` executes on this thread, a long generation
 * never blocks the UI, and the main thread can genuinely cancel it by `terminate()`-ing the
 * worker (the only way to interrupt a busy synchronous computation).
 */
import type { Project } from "@/core/project/types";
import type { GenerateResult } from "./adapter";
import { generateModelSync } from "./solidGenerator";

export interface WorkerRequest {
  id: number;
  project: Project;
}
export type WorkerResponse = { id: number } & GenerateResult;

/**
 * Minimal view of the worker global — just the two members used here. Avoids pulling the
 * whole "WebWorker" lib into the app tsconfig, whose globals collide with "DOM" (both declare
 * `self`, `postMessage`, …).
 */
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, project } = e.data;
  let result: GenerateResult;
  try {
    result = generateModelSync(project);
  } catch (err) {
    result = {
      ok: false,
      error: { code: "WORKER_EXCEPTION", message: err instanceof Error ? err.message : "The geometry worker threw while generating." },
    };
  }
  const response: WorkerResponse = { id, ...result };
  ctx.postMessage(response);
};
