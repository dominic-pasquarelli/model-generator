import { describe, it, expect } from "vitest";
import {
  ringArea,
  ccw,
  pointInRing,
  rectRing,
  convexHull,
  offsetRingOutward,
  boundingBox,
  ringsOverlap,
  ringsSeparated,
  segmentsIntersect,
  circleRing,
  onSegment,
  isSimpleRing,
  ringContainsRing,
  pointInRingStrict,
  type Pt,
} from "./poly2d";

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

  it("segmentsIntersect detects endpoint contact and collinear overlap (reviewer #1)", () => {
    // Endpoint touching the other segment's interior.
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 8 })).toBe(true);
    // Shared endpoint only.
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 })).toBe(true);
    // Collinear overlapping segments.
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(true);
    // Collinear but disjoint (a gap along the same line).
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 10, y: 0 })).toBe(false);
  });

  it("onSegment classifies on/off within tolerance", () => {
    expect(onSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
    expect(onSegment({ x: 5, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
    expect(onSegment({ x: 12, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false); // beyond the span
  });

  it("isSimpleRing rejects self-intersecting and degenerate rings", () => {
    expect(isSimpleRing(rectRing(0, 0, 10, 6))).toBe(true);
    // Bowtie (self-intersecting).
    expect(isSimpleRing([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
    // Duplicate consecutive point (zero-length edge).
    expect(isSimpleRing([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(false);
  });

  it("ringsSeparated is false for tangent rings and true for a clear gap", () => {
    const a = circleRing(0, 0, 5, 32);
    const tangent = circleRing(10, 0, 5, 32); // centres 10 apart, radii 5 → touch at (5,0)
    const clear = circleRing(11, 0, 5, 32); // 1 mm gap
    expect(ringsSeparated(a, tangent)).toBe(false);
    expect(ringsSeparated(a, clear)).toBe(true);
  });

  it("ringContainsRing requires the whole inner ring inside, not just its centre", () => {
    const plate = rectRing(0, 0, 20, 20);
    expect(ringContainsRing(plate, circleRing(10, 10, 4, 24))).toBe(true);
    // Centre inside, rim crossing the right edge.
    expect(ringContainsRing(plate, circleRing(18, 10, 4, 24))).toBe(false);
    expect(pointInRingStrict({ x: 18, y: 10 }, plate)).toBe(true); // centre alone would pass
  });

  it("offsetRingOutward returns null when a concave offset folds over itself", () => {
    // A rectangle with a 2-wide slot; offsetting outward by 3 collapses the slot walls.
    const notched: Pt[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 25 },
      { x: 42, y: 25 },
      { x: 42, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
      { x: 0, y: 60 },
    ];
    expect(offsetRingOutward(notched, 3)).toBeNull();
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
