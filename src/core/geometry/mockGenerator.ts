/**
 * Illustrative deterministic generator. It does NOT run a solid kernel — it derives
 * the bracket's outer dimensions, standoff count, and clip warnings from the
 * canonical model so preview and export stay consistent and reproducible. Its
 * `capabilities.exactSolid` is false: it cannot produce a real STEP body. Replacing
 * it with a kernel-backed adapter is the subject of GEOMETRY_GENERATION_PLAN.
 */
import { bbox, rectIntersectsCircle, circlesOverlap, type Point } from "@/core/geom";
import { boardFrame, generationParams, outlineDims, standoffSeatRadiusPx } from "@/core/project/derive";
import type { GeneratedDimensions, GeneratedModel, KeepOut, Project } from "@/core/project/types";
import { maybe } from "@/core/project/value";
import { shortHash } from "@/lib/id";
import type { GenerateResult, GeometryAdapter } from "./adapter";

const WALL_MM = 3; // Illustrative wall/margin around the board footprint.

function keepOutHitsCircle(k: KeepOut, center: Point, radiusPx: number): boolean {
  if (k.shape === "rect" && k.rectPx) return rectIntersectsCircle(k.rectPx, center, radiusPx);
  if (k.shape === "circle" && k.circlePx)
    return circlesOverlap(center, radiusPx, k.circlePx.center, k.circlePx.radiusPx);
  if (k.shape === "polygon" && k.polygonPx && k.polygonPx.length >= 3)
    return rectIntersectsCircle(bbox(k.polygonPx), center, radiusPx);
  return false;
}

/**
 * Returns null when the mount height cannot be derived because standoff height or
 * base thickness is Unknown — the height must never be fabricated from an absent Val.
 */
export function computeDimensions(project: Project): GeneratedDimensions | null {
  const dims = outlineDims(project);
  if (!dims) return null;
  const base = maybe(project.mount.baseThicknessMm);
  const standoff = maybe(project.mount.standoffHeightMm);
  if (base == null || standoff == null) return null;
  const standoffCount = project.board.holes.length;
  const widthMm = Math.round(dims.widthMm + 2 * WALL_MM);
  const depthMm = Math.round(dims.heightMm + 2 * WALL_MM);
  const heightMm = round2(base + standoff);
  const triangles = 6000 + standoffCount * 2800 + project.mount.sideTabs * 900 + project.board.keepOuts.length * 400;
  return { widthMm, depthMm, heightMm, standoffCount, bodies: 1, triangles };
}

/**
 * Warnings that a real generator would surface — clipped seats, thin walls. When the
 * standoff seat radius is indeterminate (unknown boss diameter), seat-clip warnings
 * are skipped rather than computed against an assumed size.
 */
export function computeWarnings(project: Project): string[] {
  const warnings: string[] = [];
  const seat = standoffSeatRadiusPx(project);
  if (seat == null) return warnings;
  project.board.holes.forEach((h, i) => {
    for (const k of project.board.keepOuts) {
      if (keepOutHitsCircle(k, h.centerPx, seat)) {
        warnings.push(`S${i + 1} seat clipped by ${k.label} — reduced wall margin`);
      }
    }
  });
  return warnings;
}

export const mockGenerator: GeometryAdapter = {
  name: "illustrative-mock",
  capabilities: { exactSolid: false, previewMesh: false },
  async generate(project: Project, signal?: AbortSignal): Promise<GenerateResult> {
    if (signal?.aborted) return { ok: false, error: { code: "ABORTED", message: "Generation cancelled." } };

    const frame = boardFrame(project);
    if (!frame) {
      return {
        ok: false,
        error: {
          code: "UNRESOLVED_MODEL",
          message: "A valid calibration and a board outline are required before a mount can be generated.",
          feature: !project.calibration || project.calibration.status !== "valid" ? "calibration" : "outline",
        },
      };
    }
    if (project.board.holes.length === 0) {
      return {
        ok: false,
        error: {
          code: "NO_STANDOFFS",
          message: "At least one mounting hole is needed to place a standoff.",
          feature: "holes",
        },
      };
    }
    const missingDiameter = project.board.holes.find((h) => maybe(h.diameterMm) === undefined);
    if (missingDiameter) {
      return {
        ok: false,
        error: {
          code: "MISSING_DIAMETER",
          message: `${missingDiameter.label} has no diameter; its standoff and screw hole cannot be sized.`,
          feature: missingDiameter.label,
        },
      };
    }
    // The mount height is base + standoff; neither may be Unknown (unknown is never zero).
    if (maybe(project.mount.standoffHeightMm) == null || maybe(project.mount.baseThicknessMm) == null) {
      const feature = maybe(project.mount.standoffHeightMm) == null ? "standoff height" : "base thickness";
      return {
        ok: false,
        error: {
          code: "MISSING_MOUNT_HEIGHT",
          message: `Mount ${feature} is not set; the bracket height cannot be derived.`,
          feature,
        },
      };
    }

    const dims = computeDimensions(project);
    if (!dims) {
      return { ok: false, error: { code: "NO_DIMENSIONS", message: "Outline produced no measurable footprint." } };
    }

    const paramsHash = shortHash(JSON.stringify(generationParams(project)));
    const model: GeneratedModel = {
      sourceVersion: project.version,
      paramsHash,
      dims,
      warnings: computeWarnings(project),
      createdAt: Date.now(),
      durationMs: 600,
      upToDate: true,
    };
    return { ok: true, model };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
