/**
 * Val<T> — the honesty primitive. A captured fact is either genuinely absent
 * (unknown) or present with a provenance state. Nothing is silently zero.
 *
 * State ladder (canonical vocabulary from UX Vision):
 *   inferred → suggested by geometry/defaults/heuristics; editable, not measured
 *   measured → entered from a known measurement source
 *   confirmed → reviewed and accepted by the user
 *
 * Serializes as a plain JSON discriminated union.
 */

export type ValueSource = "inferred" | "measured" | "confirmed";

export interface Known<T> {
  known: true;
  value: T;
  source: ValueSource;
  /** Optional provenance note, e.g. "Calipers — hole-to-hole centers". */
  note?: string;
}

export interface Unknown {
  known: false;
}

export type Val<T> = Known<T> | Unknown;

export const UNKNOWN: Unknown = { known: false };

export function unknownVal<T>(): Val<T> {
  return UNKNOWN;
}
export function inferred<T>(value: T, note?: string): Known<T> {
  return note === undefined ? { known: true, value, source: "inferred" } : { known: true, value, source: "inferred", note };
}
export function measured<T>(value: T, note?: string): Known<T> {
  return note === undefined ? { known: true, value, source: "measured" } : { known: true, value, source: "measured", note };
}
export function confirmed<T>(value: T, note?: string): Known<T> {
  return note === undefined ? { known: true, value, source: "confirmed" } : { known: true, value, source: "confirmed", note };
}

export function isKnown<T>(v: Val<T>): v is Known<T> {
  return v.known === true;
}

/** Read the value or an EXPLICIT fallback. There is no implicit zero. */
export function valueOr<T>(v: Val<T>, fallback: T): T {
  return isKnown(v) ? v.value : fallback;
}

/** Read the value or `undefined` — for callers that must branch on absence. */
export function maybe<T>(v: Val<T>): T | undefined {
  return isKnown(v) ? v.value : undefined;
}

/** Typing a measured value upgrades Inferred → Measured (and sets Unknown → Measured). */
export function typeMeasured<T>(value: T, note?: string): Known<T> {
  return measured(value, note);
}

/** Confirm a known value (review gate). Confirming Unknown is a no-op. */
export function confirm<T>(v: Val<T>): Val<T> {
  return isKnown(v) ? { ...v, source: "confirmed" } : v;
}
