/**
 * Dedicated Web Worker that runs the STL/STEP serialization + artifact hashing off the main
 * thread (reviewer #1). The main thread posts the canonical {@link Project}, the export
 * options, and (optionally) the already-built geometry so the kernel is not re-run here; the
 * worker walks the three export stages, posting REAL progress between them — build, serialise,
 * hash — so the progress bar reflects completed work rather than a synthetic timer. A long
 * serialization can be genuinely cancelled by terminating the worker.
 */
import type { Project } from "@/core/project/types";
import type { MeshResult } from "@/core/geometry/mesh";
import { exportSnapshot, serializeBody, finalizeArtifact, type ExportArtifact, type ExportOptions } from "./exporter";
import type { ExportReadiness } from "@/core/validation/validate";

export interface ExportWorkerRequest {
  id: number;
  project: Project;
  options: ExportOptions;
  /** The worker-produced geometry build the store already cached; avoids a redundant rebuild. */
  prebuilt?: MeshResult;
}
export type ExportWorkerResponse =
  | { id: number; kind: "progress"; progress: number; stage: string }
  | { id: number; kind: "done"; artifact: ExportArtifact }
  | { id: number; kind: "error"; readiness: ExportReadiness }
  | { id: number; kind: "exception"; message: string };

/** Minimal view of the worker global — avoids pulling the whole "WebWorker" lib into tsconfig. */
interface WorkerScope {
  onmessage: ((e: MessageEvent<ExportWorkerRequest>) => void) | null;
  postMessage: (message: ExportWorkerResponse) => void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e: MessageEvent<ExportWorkerRequest>) => {
  const { id, project, options, prebuilt } = e.data;
  const post = ctx.postMessage.bind(ctx);
  try {
    // The STEP header timestamp and the sidecar's createdAtIso must be identical.
    const nowIso = options.nowIso ?? new Date(options.now ?? Date.now()).toISOString();

    post({ id, kind: "progress", progress: 6, stage: "Building solid from the canonical model" });
    const snap = exportSnapshot(project, prebuilt);
    if (!snap.ok) {
      post({ id, kind: "error", readiness: snap.readiness });
      return;
    }

    post({ id, kind: "progress", progress: 45, stage: `Serialising ${options.format.toUpperCase()} body` });
    const body = serializeBody(project, snap.snapshot, options.format, nowIso);

    post({ id, kind: "progress", progress: 82, stage: options.writeSidecar ? "Hashing artifact + writing sidecar" : "Hashing artifact" });
    const artifact = finalizeArtifact(project, snap.snapshot, body, options, nowIso);

    post({ id, kind: "done", artifact });
  } catch (err) {
    post({ id, kind: "exception", message: err instanceof Error ? err.message : "The export worker threw while serialising." });
  }
};
