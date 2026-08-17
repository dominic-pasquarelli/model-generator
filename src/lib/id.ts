/**
 * Deterministic-ish local identifiers. Uses crypto.randomUUID where available
 * (all modern browsers + Node 19+), with a small fallback so unit tests that run
 * in constrained environments never throw.
 */
export function uid(prefix = "id"): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const raw =
    g.crypto && typeof g.crypto.randomUUID === "function"
      ? g.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${raw.replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Stable non-cryptographic hash (FNV-1a) → short hex. Used for the generation
 * parameter hash shown in the UI (`a41c92…7f0e`) so a given semantic model always
 * hashes to the same value. Not a security primitive.
 */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mix a second pass for a longer, more distinctive suffix.
  let h2 = 0x9e3779b9 ^ h;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const a = (h >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}`;
}
