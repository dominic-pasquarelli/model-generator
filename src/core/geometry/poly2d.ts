/**
 * 2D polygon helpers for plate construction — dependency-free and deterministic.
 * Rings are arrays of points; positive signed area == counter-clockwise. These build
 * the plate footprint (rectangle, offset outline, or standoff-bridge hull) and classify
 * keep-outs, all without a general boolean kernel: features are spliced or added as
 * holes so the resulting solid stays a single manifold by construction.
 */
export interface Pt {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;

export function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i];
    const q = r[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Return the ring wound counter-clockwise (positive area). */
export function ccw(r: Pt[]): Pt[] {
  return ringArea(r) < 0 ? [...r].reverse() : [...r];
}

/** Even-odd point-in-polygon (boundary counts as inside within eps). */
export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Axis-aligned rectangle as a CCW ring. */
export function rectRing(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return ccw([
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]);
}

/** A circle sampled to `seg` points (CCW), centre (cx,cy), radius r. */
export function circleRing(cx: number, cy: number, r: number, seg: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (TAU * i) / seg;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out; // CCW for r > 0
}

export function boundingBox(pts: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/** Andrew's monotone-chain convex hull (CCW). */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return ccw([...lower, ...upper]);
}

function ccwTurn(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Do segments p1p2 and p3p4 cross (proper or touching)? */
export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = ccwTurn(p3, p4, p1);
  const d2 = ccwTurn(p3, p4, p2);
  const d3 = ccwTurn(p1, p2, p3);
  const d4 = ccwTurn(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

/**
 * Do two simple rings overlap (share interior area)? Conservative: a bbox reject, then
 * vertex-containment both ways, then an edge-crossing test. Over-reporting is acceptable —
 * callers use it to keep overlapping holes out of the plate triangulation, which requires
 * disjoint holes to stay manifold.
 */
export function ringsOverlap(a: Pt[], b: Pt[]): boolean {
  const ba = boundingBox(a);
  const bb = boundingBox(b);
  if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.y1 < bb.y0 || bb.y1 < ba.y0) return false;
  if (a.some((p) => pointInRing(p, b))) return true;
  if (b.some((p) => pointInRing(p, a))) return true;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

function norm(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Offset a simple CCW ring outward by `d` (mm). Each edge is pushed out along its
 * outward normal and adjacent offset edges are intersected to form the new vertex. Returns
 * null when the result self-intersects (e.g. an offset larger than a concave notch), so the
 * caller can fall back to a bounding rectangle rather than emit a degenerate plate.
 */
export function offsetRingOutward(ring: Pt[], d: number): Pt[] | null {
  const r = ccw(ring);
  const n = r.length;
  if (n < 3) return null;
  if (d === 0) return r;
  // Outward normal of a CCW ring points to the RIGHT of the edge direction.
  const offsetLines: { p: Pt; dir: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const a = r[i];
    const b = r[(i + 1) % n];
    const dir = norm(b.x - a.x, b.y - a.y);
    const outward = { x: dir.y, y: -dir.x };
    offsetLines.push({ p: { x: a.x + outward.x * d, y: a.y + outward.y * d }, dir });
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = offsetLines[(i - 1 + n) % n];
    const cur = offsetLines[i];
    const hit = intersectLines(prev.p, prev.dir, cur.p, cur.dir);
    if (!hit) return null;
    out.push(hit);
  }
  // Self-intersection guard: winding must stay CCW and area must grow.
  const a0 = Math.abs(ringArea(r));
  const a1 = ringArea(out);
  if (a1 <= a0) return null;
  return out;
}

function intersectLines(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) {
    // Parallel — collapse to the midpoint of the two support points.
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}
