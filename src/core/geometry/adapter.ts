/**
 * Geometry adapter boundary. The canonical model is translated into geometry ONLY
 * through this seam so the kernel choice (ADR 0005) stays replaceable. The shell
 * ships an illustrative deterministic generator (mockGenerator.ts); a real solid
 * kernel is planned in docs/plans/GEOMETRY_GENERATION_PLAN.md and would implement
 * this same interface, additionally emitting an exact solid for STEP export.
 */
import type { GeneratedModel, Project } from "@/core/project/types";

/**
 * Identity of the adapter that produced a generation. It is part of the generation
 * key: swapping the adapter (or bumping its behavior) invalidates prior results, so a
 * stale generation cannot be trusted across a generator change.
 */
export const ACTIVE_ADAPTER_VERSION = "illustrative-mock@1" as const;

export interface GeometryError {
  /** Diagnosable code — never a bare "failed". */
  code: string;
  message: string;
  /** The feature/parameter implicated, when known (e.g. "standoff S2"). */
  feature?: string;
  params?: Record<string, unknown>;
}

export type GenerateResult =
  | { ok: true; model: GeneratedModel }
  | { ok: false; error: GeometryError };

export interface GeometryCapabilities {
  /** True only when the adapter can emit an exact solid suitable for STEP. */
  exactSolid: boolean;
  /** True when the adapter can produce a preview mesh. */
  previewMesh: boolean;
}

export interface GeometryAdapter {
  readonly name: string;
  readonly capabilities: GeometryCapabilities;
  /**
   * Deterministic generation from the semantic model. The same model must always
   * produce the same dimensions and parameter hash. Returns a diagnosable error
   * instead of inventing geometry when inputs are insufficient.
   */
  generate(project: Project, signal?: AbortSignal): Promise<GenerateResult>;
}
