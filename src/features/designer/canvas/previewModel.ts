import type { BracketMesh, MeshResult } from "@/core/geometry/mesh";
import { boardFrame, isGenerationCurrent } from "@/core/project/derive";
import type { GeneratedDimensions, Project } from "@/core/project/types";

export type PreviewModel =
  | { ok: false; pending: true }
  | { ok: false; pending?: false; message: string; code: string; feature?: string }
  | {
      ok: true;
      mesh: BracketMesh;
      /** ALWAYS from the passed build below — never read from project.generated. */
      dims: GeneratedDimensions;
      /** ALWAYS from the passed build below — never read from project.generated. */
      warnings: string[];
      /** "generated" iff the passed build IS the recorded generation; else "draft". */
      provenance: "generated" | "draft";
      /** Recorded generation timestamp — only when provenance is "generated". */
      recordedAt: number | null;
      /** Recorded generation duration — only when provenance is "generated". */
      recordedDurationMs: number | null;
      /** Whether any generation was ever recorded (draft = "edited" vs "not yet"). */
      hasPriorGeneration: boolean;
    };

/**
 * Single source the 3D preview renders from (reviewer #5). The mesh, dimensions, and warnings
 * all come from ONE build of the current canonical model — the SAME worker-produced build the
 * store cached by generation key (reviewer #1) — so the preview never runs the geometry kernel
 * on the main thread and never pairs a live mesh with stale stored dimensions.
 *
 * `build` is that cached build status: `undefined` means the build is still in flight (or the
 * model is unresolved, in which case a valid calibration/outline is required first — a cheap
 * frame check tells them apart without building anything). `provenance` reports whether the
 * build matches the recorded generation ("generated") or is an unrecorded edit ("draft") — a
 * label only, it never changes which build the numbers come from. The STL/STEP exporters
 * consume the same build path, so the preview is faithful to what serialises.
 */
export function previewModel(project: Project, build: MeshResult | undefined): PreviewModel {
  if (!build) {
    // No build for the current key. If the model can't resolve a board frame it is simply not
    // buildable yet — report the same coded reason the kernel would, cheaply (no kernel run).
    const frame = boardFrame(project);
    if (!frame) {
      const feature = !project.calibration || project.calibration.status !== "valid" ? "calibration" : "outline";
      return {
        ok: false,
        message: "A valid calibration and a board outline are required before a mount can be generated.",
        code: "UNRESOLVED_MODEL",
        feature,
      };
    }
    // Frame exists → a build is genuinely in flight off the main thread.
    return { ok: false, pending: true };
  }
  // Preserve the coded diagnostic (reviewer #2) so the preview names the real cause
  // (e.g. KEEPOUT_BLOCKED, MISSING_TOLERANCE), not a generic "couldn't generate".
  if (!build.ok) return { ok: false, message: build.error.message, code: build.error.code, feature: build.error.feature };
  const gen = project.generated;
  const current = isGenerationCurrent(project) && gen != null;
  return {
    ok: true,
    mesh: build.mesh,
    dims: build.dims,
    warnings: build.warnings,
    provenance: current ? "generated" : "draft",
    recordedAt: current ? gen.createdAt : null,
    recordedDurationMs: current ? gen.durationMs : null,
    hasPriorGeneration: gen != null,
  };
}
