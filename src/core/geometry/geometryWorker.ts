/**
 * Dedicated Web Worker that runs the FULL geometry build off the main thread (reviewer #1).
 *
 * The main thread posts the canonical {@link Project}; this worker runs {@link buildBracketMesh}
 * — mesh assembly, the manifold audit, effective params, the mm recipe, and the mesh hash — and
 * posts back one immutable build result (or a coded failure). Because every heavy computation
 * happens here, the main thread stays responsive, and a long build can be genuinely cancelled by
 * terminating the worker. The result (including its typed-array mesh buffers) is structure-cloned
 * back; the build itself, not just metadata, is what runs off-thread.
 */
import type { Project } from "@/core/project/types";
import { buildBracketMesh, type MeshResult } from "./mesh";

export interface WorkerRequest {
  id: number;
  project: Project;
}
export type WorkerResponse = { id: number; result: MeshResult };

/** Minimal view of the worker global — avoids pulling the whole "WebWorker" lib into tsconfig. */
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, project } = e.data;
  let result: MeshResult;
  try {
    result = buildBracketMesh(project);
  } catch (err) {
    result = { ok: false, error: { code: "WORKER_EXCEPTION", message: err instanceof Error ? err.message : "The geometry worker threw while building." } };
  }
  ctx.postMessage({ id, result });
};
