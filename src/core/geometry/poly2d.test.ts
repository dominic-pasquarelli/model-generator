import { describe, it, expect } from "vitest";
import { ringArea, ccw, pointInRing, rectRing, convexHull, offsetRingOutward, boundingBox, ringsOverlap, segmentsIntersect, circleRing, type Pt } from "./poly2d";

describe("poly2d", () => {
  it("rectRing is CCW with the right area", () => {
    const r = rectRing(0, 0, 10, 4);
    expect(ringArea(r)).toBeCloseTo(40, 6);
  });

  it("ccw normalises a CW ring", () => {
    const cwSquare: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 0 },
    ];
    expect(ringArea(cwSquare)).toBeLessThan(0);
    expect(ringArea(ccw(cwSquare))).toBeGreaterThan(0);
  });

  it("pointInRing classifies inside/outside", () => {
    const sq = rectRing(0, 0, 10, 10);
    expect(pointInRing({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInRing({ x: 15, y: 5 }, sq)).toBe(false);
  });

  it("convexHull wraps a point cloud", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior point excluded
    ]);
    expect(hull.length).toBe(4);
    expect(Math.abs(ringArea(hull))).toBeCloseTo(100, 6);
  });

  it("segmentsIntersect detects crossings", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it("ringsOverlap detects overlapping and disjoint holes", () => {
    const a = circleRing(0, 0, 5, 24);
    const overlap = circleRing(6, 0, 5, 24); // centres 6 apart, radii 5 → overlap
    const disjoint = circleRing(20, 0, 5, 24);
    expect(ringsOverlap(a, overlap)).toBe(true);
    expect(ringsOverlap(a, disjoint)).toBe(false);
    // a rectangle straddling a circle
    expect(ringsOverlap(a, rectRing(-2, -2, 2, 2))).toBe(true);
  });

  it("offsetRingOutward grows a rectangle by d on every side", () => {
    const out = offsetRingOutward(rectRing(0, 0, 10, 6), 2);
    expect(out).not.toBeNull();
    const bb = boundingBox(out!);
    expect(bb.x0).toBeCloseTo(-2, 6);
    expect(bb.y0).toBeCloseTo(-2, 6);
    expect(bb.x1).toBeCloseTo(12, 6);
    expect(bb.y1).toBeCloseTo(8, 6);
  });
});
