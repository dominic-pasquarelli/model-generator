import { useEffect } from "react";
import { generationKey } from "@/core/project/derive";
import type { Project } from "@/core/project/types";
import type { MeshResult } from "@/core/geometry/mesh";
import { useStore } from "@/state/store";

/**
 * Subscribe to the store's ONE keyed geometry build for the current model, requesting a build
 * off the main thread when the cache has none (reviewer #1). Returns the cached build status —
 * `undefined` while the build is in flight or the model is unresolved (no calibration/outline).
 * Every 3D surface uses this, so preview and the export view render from the SAME build the
 * validation status and the exporter consume; the geometry kernel never runs on the main thread.
 */
export function useLiveBuild(project: Project): MeshResult | undefined {
  const key = generationKey(project);
  const build = useStore((s) => (key ? s.builds[key] : undefined));
  const ensureBuild = useStore((s) => s.ensureBuild);
  useEffect(() => {
    ensureBuild();
  }, [key, ensureBuild]);
  return build;
}
