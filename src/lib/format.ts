/** Number + time formatting helpers. All values render with tabular figures in the UI. */

/** Fixed-decimal millimetre/number formatting (default 2 dp), stable across locales. */
export function fmt(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

/** Group thousands for pixel readouts: 2496 → "2,496". */
export function fmtInt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** HH:MM clock label for the autosave indicator, from an epoch-ms timestamp. */
export function clock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Human relative time for library cards: "2 h ago", "yesterday", "Aug 12". */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) return `${Math.floor(diff / hr)} h ago`;
  if (diff < 2 * day) return "yesterday";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Truncated hash label like the mockups' `a41c92…7f0e`. */
export function hashLabel(hash: string): string {
  if (hash.length <= 10) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
