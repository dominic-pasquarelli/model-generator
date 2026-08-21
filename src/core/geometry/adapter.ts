/**
 * Geometry generation identity + error shape. The canonical model is turned into a solid by
 * the self-contained mesh generator ({@link buildBracketMesh} in mesh.ts), run off the main
 * thread by the build worker (geometryWorker.ts / buildClient.ts) and cached by the store on
 * the canonical generation key (reviewer #1). An exact ANALYTIC B-rep kernel could later
 * replace the mesh path behind the same {@link MeshResult} contract
 * (docs/plans/GEOMETRY_GENERATION_PLAN.md).
 */

/**
 * Identity of the geometry path that produced a build. It is part of the generation key:
 * bumping the generator's behavior invalidates prior results, so a stale generation is never
 * trusted across a generator change.
 */
export const ACTIVE_ADAPTER_VERSION = "mesh-solid@1" as const;

export interface GeometryError {
  /** Diagnosable code — never a bare "failed". */
  code: string;
  message: string;
  /** The feature/parameter implicated, when known (e.g. "standoff S2"). */
  feature?: string;
  params?: Record<string, unknown>;
}
