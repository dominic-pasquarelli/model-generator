/**
 * Polygon triangulation (ear clipping with holes) — dependency-free and deterministic.
 *
 * A doubly-linked-list ear-clipping triangulator (the well-known "earcut" technique):
 * holes are eliminated by bridging each hole's leftmost vertex to a mutually-visible
 * outer vertex, then the merged simple polygon is ear-clipped. Robust for a plate outline
 * with many circular/polygonal holes (standoff seats, bores, keep-outs). Output triangles
 * are wound counter-clockwise. Used to cap the top/bottom faces of the generated solid.
 */
export interface Pt {
  x: number;
  y: number;
}

class Node {
  x: number;
  y: number;
  i: number;
  prev!: Node;
  next!: Node;
  steiner = false;
  constructor(i: number, x: number, y: number) {
    this.i = i;
    this.x = x;
    this.y = y;
  }
}

export function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Triangulate `outer` (with optional `holes`). Returns the combined vertex list (outer
 * then holes, in order) and CCW triangle index triples into it.
 */
export function triangulate(outer: Pt[], holes: Pt[][] = []): { vertices: Pt[]; triangles: [number, number, number][] } {
  const vertices: Pt[] = [];
  const push = (ring: Pt[]) => {
    const start = vertices.length;
    for (const p of ring) vertices.push({ x: p.x, y: p.y });
    return { start, end: vertices.length };
  };

  const outerRange = push(outer);
  let outerNode = buildLinked(vertices, outerRange.start, outerRange.end, true);
  if (!outerNode) return { vertices, triangles: [] };

  if (holes.length > 0) {
    const queue: Node[] = [];
    for (const h of holes) {
      const range = push(h);
      const list = buildLinked(vertices, range.start, range.end, false);
      if (list) {
        if (list === list.next) list.steiner = true;
        queue.push(leftmost(list));
      }
    }
    queue.sort((a, b) => a.x - b.x);
    for (const q of queue) outerNode = eliminateHole(q, outerNode);
  }

  const triangles: [number, number, number][] = [];
  earcutLinked(outerNode, triangles);
  return { vertices, triangles };
}

/** Build a circular doubly-linked list for [start,end); force CCW when clockwise !== expected. */
function buildLinked(v: Pt[], start: number, end: number, wantCCW: boolean): Node | null {
  const n = end - start;
  if (n < 3) return null;
  const ccw = signedArea(v.slice(start, end)) > 0;
  let last: Node | null = null;
  if (ccw === wantCCW) {
    for (let i = start; i < end; i++) last = insertNode(i, v[i].x, v[i].y, last);
  } else {
    for (let i = end - 1; i >= start; i--) last = insertNode(i, v[i].x, v[i].y, last);
  }
  return last;
}

function insertNode(i: number, x: number, y: number, last: Node | null): Node {
  const p = new Node(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

function removeNode(p: Node): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
}

function leftmost(start: Node): Node {
  let p = start;
  let m = start;
  do {
    if (p.x < m.x || (p.x === m.x && p.y < m.y)) m = p;
    p = p.next;
  } while (p !== start);
  return m;
}

function area(p: Node, q: Node, r: Node): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (
    (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
    (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
    (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0
  );
}

// ---- hole elimination (bridge each hole to the outer polygon) ----

function eliminateHole(hole: Node, outerNode: Node): Node {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(outerNode, outerNode.next);
}

function findHoleBridge(hole: Node, outerNode: Node): Node | null {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: Node | null = null;
  // Find the edge to the right of the hole's leftmost point; the endpoint with max x is a candidate.
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) / (p.next.y - p.y)) * (p.next.x - p.x);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m; // exactly on a vertex
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return null;

  // Look for a reflex vertex inside the triangle (hole, m, edge-point) closer in angle.
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m!.x || (p.x === m!.x && sectorContainsSector(m!, p)))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

function sectorContainsSector(m: Node, p: Node): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

function locallyInside(a: Node, b: Node): boolean {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

/** Splice a two-way bridge between a and b (which belong to different rings). */
function splitPolygon(a: Node, b: Node): Node {
  const a2 = new Node(a.i, a.x, a.y);
  const b2 = new Node(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

function filterPoints(start: Node, end?: Node): Node {
  let e = end ?? start;
  let p = start;
  let again = true;
  do {
    again = false;
    if (!p.steiner && (equalNode(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = e = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== e);
  return e;
}

function equalNode(a: Node, b: Node): boolean {
  return a.x === b.x && a.y === b.y;
}

// ---- ear clipping ----

function earcutLinked(ear: Node | null, triangles: [number, number, number][], pass = 0): void {
  if (!ear) return;
  let stop = ear;
  let prev: Node;
  let next: Node;
  let p = ear;
  while (p.prev !== p.next) {
    prev = p.prev;
    next = p.next;
    if (isEar(p)) {
      triangles.push([prev.i, p.i, next.i]);
      removeNode(p);
      p = next.next;
      stop = next.next;
      continue;
    }
    p = next;
    if (p === stop) {
      // No ear found on a full pass — try filtering collinear points once, else bail.
      if (pass === 0) {
        earcutLinked(filterPoints(p), triangles, 1);
      }
      return;
    }
  }
}

function isEar(ear: Node): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) return false; // reflex or collinear (CCW ring → convex is negative)
  let p = ear.next.next;
  while (p !== ear.prev) {
    if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
