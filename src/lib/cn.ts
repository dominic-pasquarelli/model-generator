/** Tiny className combiner — joins truthy strings, skips falsey values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
