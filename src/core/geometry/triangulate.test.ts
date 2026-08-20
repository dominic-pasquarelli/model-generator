import { describe, it, expect } from "vitest";
import { triangulate, signedArea, type Pt } from "./triangulate";

function triArea(v: Pt[], t: [number, number, number]): number {
  return signedArea([v[t[0]], v[t[1]], v[t[2]]]);
}
function totalArea(r: ReturnType<typeof triangulate>): number {
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
    const r = triangulate(square(10));
    expect(r.triangles.length).toBe(2);
    for (const t of r.triangles) expect(triArea(r.vertices, t)).toBeGreaterThan(0);
    expect(totalArea(r)).toBeCloseTo(100, 6);
  });

  it("covers outer-minus-hole area for a polygon with a hole, all CCW", () => {
    const outer = square(10);
    const hole = square(4, 3, 3); // interior 4x4 hole
    const r = triangulate(outer, [hole]);
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
    const r = triangulate(L);
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
    expect(totalArea(triangulate(cw))).toBeCloseTo(64, 6);
  });
});
