/**
 * Production geometry adapter: a real, self-contained solid generator.
 *
 * Unlike the illustrative mock, this adapter builds an actual watertight, manifold
 * triangle solid via {@link buildBracketMesh} and reports the real bounding box, body
 * count, and triangle count. It backs the live 3D preview and the STL / faceted-STEP
 * exporters — all three consume the same solid path. `exactSolid` is false (the STEP is
 * faceted, not analytic), but `previewMesh` and `facetedStep` are true because both are
 * genuinely produced. Determinism holds: the same model yields the same mesh and hash.
 */
import { generationKey } from "@/core/project/derive";
import type { GeneratedModel, Project } from "@/core/project/types";
import { ACTIVE_ADAPTER_VERSION, type GenerateResult, type GeometryAdapter } from "./adapter";
import { buildBracketMesh } from "./mesh";

function now(): number {
  const g = globalThis as { performance?: { now?: () => number } };
  return g.performance?.now ? g.performance.now() : 0;
}

export const solidGenerator: GeometryAdapter = {
  name: ACTIVE_ADAPTER_VERSION,
  capabilities: { exactSolid: false, previewMesh: true, facetedStep: true },
  async generate(project: Project, signal?: AbortSignal): Promise<GenerateResult> {
    if (signal?.aborted) return { ok: false, error: { code: "ABORTED", message: "Generation cancelled." } };
    const started = now();
    const built = buildBracketMesh(project);
    if (!built.ok) return { ok: false, error: built.error };

    const key = generationKey(project); // non-null: buildBracketMesh already required a frame
    const elapsed = now() - started;
    const model: GeneratedModel = {
      sourceVersion: project.version,
      key: key ?? "",
      paramsHash: key ?? "",
      dims: built.dims,
      warnings: built.warnings, // computed from the EFFECTIVE generated geometry
      createdAt: Date.now(),
      durationMs: Number.isFinite(elapsed) && elapsed > 0 ? Math.round(elapsed * 100) / 100 : null,
    };
    return { ok: true, model };
  },
};
