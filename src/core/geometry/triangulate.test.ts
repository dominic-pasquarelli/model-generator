import { describe, it, expect } from "vitest";
import { triangulate, signedArea, type Pt, type TriangulateResult } from "./triangulate";

function ok(r: TriangulateResult): Extract<TriangulateResult, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
  return r;
}
function triArea(v: Pt[], t: [number, number, number]): number {
  return signedArea([v[t[0]], v[t[1]], v[t[2]]]);
}
function totalArea(r: Extract<TriangulateResult, { ok: true }>): number {
  return r.triangles.reduce((s, t) => s + triArea(r.vertices, t), 0);
}

const square = (s: number, ox = 0, oy = 0): Pt[] => [
  { x: ox, y: oy },
  { x: ox + s, y: oy },
  { x: ox + s, y: oy + s },
  { x: ox, y: oy + s },
];

describe("triangulate", () => {
  it("triangulates a square into 2 CCW triangles covering its area", () => {
    const r = ok(triangulate(square(10)));
    expect(r.triangles.length).toBe(2);
    for (const t of r.triangles) expect(triArea(r.vertices, t)).toBeGreaterThan(0);
    expect(totalArea(r)).toBeCloseTo(100, 6);
    expect(r.area).toBeCloseTo(100, 6);
  });

  it("covers outer-minus-hole area for a polygon with a hole, all CCW", () => {
    const outer = square(10);
    const hole = square(4, 3, 3); // interior 4x4 hole
    const r = ok(triangulate(outer, [hole]));
    expect(r.triangles.length).toBeGreaterThan(0);
    for (const t of r.triangles) expect(triArea(r.vertices, t)).toBeGreaterThan(-1e-6);
    expect(totalArea(r)).toBeCloseTo(100 - 16, 4);
  });

  it("handles a concave (L-shaped) polygon", () => {
    const L: Pt[] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 6 },
      { x: 0, y: 6 },
    ];
    const r = ok(triangulate(L));
    // Area = 6*2 + 2*4 = 20
    expect(totalArea(r)).toBeCloseTo(20, 4);
    for (const t of r.triangles) expect(triArea(r.vertices, t)).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = triangulate(square(10), [square(3, 4, 4)]);
    const b = triangulate(square(10), [square(3, 4, 4)]);
    expect(a).toEqual(b);
  });

  it("accepts CW input (normalises winding) and still covers the area", () => {
    const cw = [...square(8)].reverse();
    expect(totalArea(ok(triangulate(cw)))).toBeCloseTo(64, 6);
  });

  // ---- fail-closed regressions (reviewer #1) ----

  it("fails when a hole lies outside the outer polygon (cannot bridge)", () => {
    const outer = square(10);
    const outside = square(3, 20, 20); // wholly outside
    const r = triangulate(outer, [outside]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["UNBRIDGED_HOLE", "AREA_MISMATCH"]).toContain(r.code);
  });

  it("fails when two holes overlap (area cannot match / bridge fails)", () => {
    const outer = square(20);
    const h1 = square(6, 4, 7);
    const h2 = square(6, 7, 7); // overlaps h1
    const r = triangulate(outer, [h1, h2]);
    expect(r.ok).toBe(false);
  });

  it("reports the covered area on success so callers can cross-check", () => {
    const r = ok(triangulate(square(10), [square(2, 2, 2), square(2, 6, 6)]));
    expect(r.area).toBeCloseTo(100 - 4 - 4, 4);
  });
});
