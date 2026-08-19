/**
 * Units + calibration transform. The single place that turns pixels into
 * millimetres. Correctness rule (Board Mount Designer workflow): pixel coordinates
 * are never millimetres until calibration establishes a transform.
 */
import { distance, type Point } from "@/core/geom";

export type Unit = "mm" | "inch";

export const MM_PER_INCH = 25.4;

export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH;
}
export function inchToMm(inch: number): number {
  return inch * MM_PER_INCH;
}

/** Convert a millimetre magnitude into the display unit. */
export function toDisplay(mm: number, unit: Unit): number {
  return unit === "mm" ? mm : mmToInch(mm);
}
/** Convert a value typed in the display unit back to millimetres (canonical). */
export function fromDisplay(value: number, unit: Unit): number {
  return unit === "mm" ? value : inchToMm(value);
}

/** Sensible fixed decimals for each unit (inch needs finer resolution than mm). */
export function unitDecimals(unit: Unit): number {
  return unit === "mm" ? 2 : 3;
}

/** Short suffix for readouts. */
export function unitLabel(unit: Unit): string {
  return unit === "mm" ? "mm" : "in";
}

/** Format a millimetre magnitude in the display unit (no unit suffix). */
export function fmtLen(mm: number, unit: Unit, decimals = unitDecimals(unit)): string {
  if (!Number.isFinite(mm)) return "—";
  return toDisplay(mm, unit).toFixed(decimals);
}

/**
 * A calibration establishes a uniform pixel-per-millimetre scale from one known
 * distance placed on the reference image. Two lines (future) would additionally
 * expose skew; the MVP models a single isotropic scale.
 */
export interface CalibrationScale {
  /** Pixels per millimetre. */
  pxPerMm: number;
}

export function pxLengthToMm(pxLen: number, scale: CalibrationScale): number {
  return pxLen / scale.pxPerMm;
}
export function mmLengthToPx(mm: number, scale: CalibrationScale): number {
  return mm * scale.pxPerMm;
}

/** Plausibility band for a phone/scan of a whole board, in px/mm. Heuristic, not a law. */
export const PLAUSIBLE_PX_PER_MM = { min: 1.5, max: 200 } as const;

export interface CalibrationAssessment {
  /** Raw pixel distance between the two anchors. */
  pixelDistance: number;
  /** Computed scale if the inputs are usable, else null. */
  pxPerMm: number | null;
  /** True only when the scale is finite and inside the plausibility band. */
  valid: boolean;
  /** Machine reason when not valid. */
  reason?: "non-positive-distance" | "non-positive-length" | "implausible-high" | "implausible-low";
  /** Human-facing explanation for the UI. */
  message?: string;
  /**
   * When a classic unit slip is likely (value ~10× too small → scale ~10× too big),
   * the distance that would land the scale back in a plausible range.
   */
  suggestedMm?: number;
}

/**
 * Assess a candidate calibration WITHOUT committing it. Rejected calibrations must
 * never overwrite prior state — the caller keeps the previous scale on `valid === false`.
 */
export function assessCalibration(a: Point, b: Point, knownMm: number): CalibrationAssessment {
  const pixelDistance = distance(a, b);
  if (pixelDistance <= 0) {
    return {
      pixelDistance,
      pxPerMm: null,
      valid: false,
      reason: "non-positive-distance",
      message: "The two calibration anchors are on the same spot — separate them along a known dimension.",
    };
  }
  if (!(knownMm > 0)) {
    return {
      pixelDistance,
      pxPerMm: null,
      valid: false,
      reason: "non-positive-length",
      message: "Enter a positive real-world distance between the anchors.",
    };
  }
  const pxPerMm = pixelDistance / knownMm;
  if (pxPerMm > PLAUSIBLE_PX_PER_MM.max) {
    // Suggest ×10 (the common cm/mm slip): 7.80 → 78.0.
    const suggestedMm = knownMm * 10;
    const suggestPlausible = pixelDistance / suggestedMm <= PLAUSIBLE_PX_PER_MM.max;
    return {
      pixelDistance,
      pxPerMm,
      valid: false,
      reason: "implausible-high",
      message: `${knownMm.toFixed(2)} mm across ${Math.round(pixelDistance).toLocaleString("en-US")} px would mean ${Math.round(
        pxPerMm,
      )} px per mm — far beyond this photo's plausible resolution.`,
      ...(suggestPlausible ? { suggestedMm } : {}),
    };
  }
  if (pxPerMm < PLAUSIBLE_PX_PER_MM.min) {
    return {
      pixelDistance,
      pxPerMm,
      valid: false,
      reason: "implausible-low",
      message: `${knownMm.toFixed(2)} mm across only ${Math.round(pixelDistance)} px implies ${pxPerMm.toFixed(
        2,
      )} px per mm — too coarse to trust. Re-measure a longer, well-defined dimension.`,
    };
  }
  return { pixelDistance, pxPerMm, valid: true };
}
