/**
 * Named, versioned fastener fabrication profiles (reviewer #3). Each mounting hole owns its
 * fastener + install style; the standoff bore, the recommended minimum boss (standoff outer)
 * diameter, and — for heat-set inserts — the minimum seat depth come from this table rather
 * than a bare heuristic. These are INFERRED defaults (provenance = inferred, sourced from
 * FASTENER_PROFILES_VERSION): sensible recommended values, not measured against a specific
 * vendor part, so the export honesty policy lists and acknowledges them like any inferred
 * dimension. A per-hole measured override supersedes the profile; a `custom` fastener has no
 * profile and requires an explicit bore, or generation blocks.
 *
 * All values are millimetres. The three styles are genuinely different: through-bolt is a
 * screw clearance hole; self-tapping is a thread-forming pilot (replacing the old unnamed 0.8×
 * factor); heat-set is the recommended insert bore with a real minimum insertion depth.
 */
import type { FastenerChoice, FastenerStyle } from "@/core/project/types";

export interface FastenerProfile {
  /** Standoff bore diameter (the actual cut) before the print-tolerance offset. */
  boreDiameterMm: number;
  /** Recommended minimum standoff outer (boss) diameter for a sound wall around the bore. */
  minBossDiameterMm: number;
  /** Heat-set only: minimum insert seat depth the standoff must accommodate; null otherwise. */
  insertDepthMm: number | null;
}

/** Bump when any profile value changes so prior generations invalidate. */
export const FASTENER_PROFILES_VERSION = "fastener-profiles@1";

const P = (boreDiameterMm: number, minBossDiameterMm: number, insertDepthMm: number | null = null): FastenerProfile => ({
  boreDiameterMm,
  minBossDiameterMm,
  insertDepthMm,
});

/**
 * Recommended defaults per (fastener × style). minBoss = bore + 3 mm (≈1.5 mm wall each side);
 * heat-set bores/depths follow common brass-insert guidance. Illustrative, versioned, inferred.
 */
export const FASTENER_PROFILES: Record<Exclude<FastenerChoice, "custom">, Record<FastenerStyle, FastenerProfile>> = {
  M2: { "through-bolt": P(2.4, 5.4), "self-tapping": P(1.7, 4.7), "heat-set-insert": P(3.2, 6.2, 3.0) },
  "M2.5": { "through-bolt": P(2.9, 5.9), "self-tapping": P(2.1, 5.1), "heat-set-insert": P(3.5, 6.5, 3.4) },
  M3: { "through-bolt": P(3.4, 6.4), "self-tapping": P(2.5, 5.5), "heat-set-insert": P(4.0, 7.0, 4.0) },
  M4: { "through-bolt": P(4.5, 7.5), "self-tapping": P(3.3, 6.3), "heat-set-insert": P(5.6, 8.6, 5.8) },
};

/** The recommended profile for a fastener+style, or null for a `custom` fastener (no profile). */
export function fastenerProfile(fastener: FastenerChoice, style: FastenerStyle): FastenerProfile | null {
  if (fastener === "custom") return null;
  return FASTENER_PROFILES[fastener][style];
}
