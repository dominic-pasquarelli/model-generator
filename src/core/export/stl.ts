/**
 * STL writer. Serialises a real generated {@link BracketMesh} to ASCII STL — a genuine
 * triangle solid, not a placeholder. STL is a mesh tessellation of the same single
 * connected solid the preview and STEP consume (the shared-geometry-path rule), so its
 * bounding box matches theirs exactly. Per-facet normals are computed from the triangle
 * vertices. Honesty boundary: this is generated ASCII STL; downstream slicer compatibility
 * is not yet verified against any real slicer.
 */
import type { BracketMesh } from "@/core/geometry/mesh";

/** Fixed 6-significant-digit formatting keeps output deterministic across machines. */
function n(v: number): string {
  if (!Number.isFinite(v)) return "0";
  // Normalise -0 and sub-nanometre noise to 0 so identical geometry serialises identically.
  let x = Object.is(v, -0) ? 0 : v;
  if (Math.abs(x) < 1e-9) x = 0;
  let s = x.toPrecision(6);
  if (/[eE]/.test(s)) return s; // exponent form is acceptable for STL
  // Trim trailing zeros ONLY within the fractional part — never digits of an integer
  // (toPrecision(6) drops the decimal point for round integers ≥ 1e5).
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function facetNormal(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len === 0) return [0, 0, 0];
  return [nx / len, ny / len, nz / len];
}

/** Serialise the single connected solid as one ASCII STL solid. */
export function meshToAsciiStl(mesh: BracketMesh, solidName = "board_mount"): string {
  const safe = solidName.replace(/[^a-z0-9_]+/gi, "_").toLowerCase() || "board_mount";
  const p = mesh.positions;
  const idx = mesh.indices;
  const out: string[] = [`solid ${safe}`];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const [nx, ny, nz] = facetNormal(
      p[a], p[a + 1], p[a + 2],
      p[b], p[b + 1], p[b + 2],
      p[c], p[c + 1], p[c + 2],
    );
    out.push(`  facet normal ${n(nx)} ${n(ny)} ${n(nz)}`);
    out.push("    outer loop");
    out.push(`      vertex ${n(p[a])} ${n(p[a + 1])} ${n(p[a + 2])}`);
    out.push(`      vertex ${n(p[b])} ${n(p[b + 1])} ${n(p[b + 2])}`);
    out.push(`      vertex ${n(p[c])} ${n(p[c + 1])} ${n(p[c + 2])}`);
    out.push("    endloop");
    out.push("  endfacet");
  }
  out.push(`endsolid ${safe}`);
  out.push("");
  return out.join("\n");
}
