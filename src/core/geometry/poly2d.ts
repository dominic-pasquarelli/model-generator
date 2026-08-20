/**
 * 2D polygon helpers for plate construction — dependency-free and deterministic.
 * Rings are arrays of points; positive signed area == counter-clockwise. These build
 * the plate footprint (rectangle, offset outline, or standoff-bridge hull) and classify
 * keep-outs, all without a general boolean kernel: features are spliced or added as
 * holes so the resulting solid stays a single manifold by construction.
 *
 * The predicates here are tolerance-aware (reviewer #1): endpoint contact and collinear
 * overlap count as intersection; ring separation is measured against {@link CONTACT_EPS},
 * which sits an order of magnitude above the vertex-weld quantum so two features accepted
 * as disjoint can never weld into a non-manifold pinch downstream.
 */
export interface Pt {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;

/** Numerical orientation epsilon — below this a cross product is treated as zero. */
export const GEOM_EPS = 1e-9;
/**
 * Minimum clear gap (mm) between two feature rings that are accepted as disjoint. The
 * welded surface quantises vertices at 1e-4 mm (see mesh.ts `Surface`), so keeping rings
 * ≥ 1e-3 mm apart guarantees their sampled vertices never collapse together and pinch the
 * manifold. Also the tolerance for "a point lies on a ring boundary".
 */
export const CONTACT_EPS = 1e-3;

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

/** Even-odd point-in-polygon. Boundary membership is intentionally undefined here — use
 *  {@link pointInRingStrict}/{@link pointOnRing} when boundary handling must be explicit. */
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

/** Andrew's monotone-chain convex hull (CCW). Collinear/duplicate points are dropped. */
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

// ---- tolerance-aware primitive predicates ----

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Is `p` on segment ab (collinear within eps AND within the segment's span)? */
export function onSegment(p: Pt, a: Pt, b: Pt, eps = CONTACT_EPS): boolean {
  const d = distPointToSeg(p, a, b);
  return d <= eps;
}

function distPointToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Minimum distance between two segments (0 when they intersect). */
export function segSegDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(distPointToSeg(a, c, d), distPointToSeg(b, c, d), distPointToSeg(c, a, b), distPointToSeg(d, a, b));
}

/**
 * Do segments p1p2 and p3p4 intersect? Detects proper crossings AND touching/collinear
 * overlap (reviewer #1: the earlier version silently ignored endpoint and collinear
 * contact). `eps` governs the orientation sign; contact is judged with {@link onSegment}.
 */
export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt, eps = GEOM_EPS): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true;
  // Collinear / endpoint contact: a zero orientation plus containment on the other segment.
  if (Math.abs(d1) <= eps && onSegment(p1, p3, p4)) return true;
  if (Math.abs(d2) <= eps && onSegment(p2, p3, p4)) return true;
  if (Math.abs(d3) <= eps && onSegment(p3, p1, p2)) return true;
  if (Math.abs(d4) <= eps && onSegment(p4, p1, p2)) return true;
  return false;
}

/** Minimum distance from `p` to a ring's boundary. */
export function distPointToRing(p: Pt, ring: Pt[]): number {
  let best = Infinity;
  for (let i = 0, n = ring.length; i < n; i++) {
    const d = distPointToSeg(p, ring[i], ring[(i + 1) % n]);
    if (d < best) best = d;
  }
  return best;
}

/** `p` lies on the ring boundary within eps. */
export function pointOnRing(p: Pt, ring: Pt[], eps = CONTACT_EPS): boolean {
  return distPointToRing(p, ring) <= eps;
}

/** `p` is strictly inside the ring (interior, and more than eps from the boundary). */
export function pointInRingStrict(p: Pt, ring: Pt[], eps = CONTACT_EPS): boolean {
  return pointInRing(p, ring) && distPointToRing(p, ring) > eps;
}

/**
 * Is `ring` a simple polygon? No fewer than three points, no duplicate/degenerate edges,
 * and no two non-adjacent edges intersecting (touching included). O(n²) — fine for the
 * modest rings the generator and importer produce.
 */
export function isSimpleRing(ring: Pt[], eps = CONTACT_EPS): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) <= eps) return false; // zero-length edge / duplicate point
  }
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip edges that share a vertex (adjacent, and the wrap-around pair).
      if (j === i) continue;
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * Do two simple rings share interior area or cross? Conservative: bbox reject, then
 * vertex-containment both ways, then an edge-crossing test (touching included). Used to
 * keep overlapping holes out of the plate triangulation.
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

/**
 * Are two rings strictly separated — no overlap, no crossing, and every edge of one at
 * least `eps` away from every edge of the other (reviewer #1: tangent rings that pass an
 * edge-count audit but pinch a vertex must be rejected)?
 */
export function ringsSeparated(a: Pt[], b: Pt[], eps = CONTACT_EPS): boolean {
  if (ringsOverlap(a, b)) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segSegDistance(a1, a2, b[j], b[(j + 1) % b.length]) < eps) return false;
    }
  }
  return true;
}

/**
 * Is `inner` wholly inside `outer` with clearance — every inner vertex strictly interior,
 * and no inner edge within `eps` of the outer boundary (reviewer #1: a ring whose centre
 * is inside can still have a rim crossing the boundary)?
 */
export function ringContainsRing(outer: Pt[], inner: Pt[], eps = CONTACT_EPS): boolean {
  if (!inner.every((p) => pointInRingStrict(p, outer, eps))) return false;
  for (let i = 0; i < inner.length; i++) {
    const i1 = inner[i];
    const i2 = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      if (segSegDistance(i1, i2, outer[j], outer[(j + 1) % outer.length]) < eps) return false;
    }
  }
  return true;
}

function norm(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Offset a simple CCW ring outward by `d` (mm). Each edge is pushed out along its
 * outward normal and adjacent offset edges are intersected to form the new vertex. Returns
 * null when the input is not simple or the result self-intersects (e.g. an offset larger
 * than a concave notch), so the caller emits a coded error instead of a degenerate plate.
 */
export function offsetRingOutward(ring: Pt[], d: number): Pt[] | null {
  const r = ccw(ring);
  const n = r.length;
  if (n < 3) return null;
  if (d === 0) return isSimpleRing(r) ? r : null;
  if (!isSimpleRing(r)) return null;
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
  // Self-intersection guard: winding must stay CCW, area must grow, AND the result must be
  // a simple polygon (area growth alone can pass while a concave offset folds over itself).
  const a0 = Math.abs(ringArea(r));
  const a1 = ringArea(out);
  if (a1 <= a0) return null;
  if (!isSimpleRing(out)) return null;
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
