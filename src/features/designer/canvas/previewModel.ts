import { buildBracketMesh, type BracketMesh } from "@/core/geometry/mesh";
import { isGenerationCurrent } from "@/core/project/derive";
import type { GeneratedDimensions, Project } from "@/core/project/types";

export type PreviewModel =
  | { ok: false; message: string; code: string; feature?: string }
  | {
      ok: true;
      mesh: BracketMesh;
      /** ALWAYS from the live build below — never read from project.generated. */
      dims: GeneratedDimensions;
      /** ALWAYS from the live build below — never read from project.generated. */
      warnings: string[];
      /** "generated" iff the live build IS the recorded generation; else "draft". */
      provenance: "generated" | "draft";
      /** Recorded generation timestamp — only when provenance is "generated". */
      recordedAt: number | null;
      /** Recorded generation duration — only when provenance is "generated". */
      recordedDurationMs: number | null;
      /** Whether any generation was ever recorded (draft = "edited" vs "not yet"). */
      hasPriorGeneration: boolean;
    };

/**
 * Single source the 3D preview renders from (reviewer #5). The mesh, dimensions, and
 * warnings all come from ONE live build of the current canonical model, so a live mesh is
 * never paired with stale stored dimensions. `provenance` reports whether that live build
 * matches the recorded generation ("generated") or is an unrecorded edit ("draft") — a
 * label only, it never changes which build the numbers come from. The STL/STEP exporters
 * consume the same build path, so the preview is faithful to what serialises.
 */
export function previewModel(project: Project): PreviewModel {
  const built = buildBracketMesh(project);
  // Preserve the coded diagnostic (reviewer #2) so the preview names the real cause
  // (e.g. KEEPOUT_BLOCKED, MISSING_TOLERANCE), not a generic "couldn't generate".
  if (!built.ok) return { ok: false, message: built.error.message, code: built.error.code, feature: built.error.feature };
  const gen = project.generated;
  const current = isGenerationCurrent(project) && gen != null;
  return {
    ok: true,
    mesh: built.mesh,
    dims: built.dims,
    warnings: built.warnings,
    provenance: current ? "generated" : "draft",
    recordedAt: current ? gen.createdAt : null,
    recordedDurationMs: current ? gen.durationMs : null,
    hasPriorGeneration: gen != null,
  };
}
