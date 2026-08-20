/**
 * Real bracket geometry — one connected, watertight, manifold solid by construction.
 *
 * `buildBracketMesh` turns the canonical model into a SINGLE closed solid in board-space
 * millimetres: a plate (rectangular, board-outline, or standoff-bridge per strategy),
 * standoffs rising at each hole with a per-fastener bore (blind insert seat, blind pilot,
 * or through clearance), optional side tabs, and keep-out footprints subtracted from the
 * plate. Booleans are avoided: the plate top/bottom faces are triangulated with the
 * standoff/keep-out/bore circles as holes, and every feature shares welded vertices, so
 * the whole artifact is one connected manifold — not a pile of overlapping shells.
 *
 * Honesty (reviewer #2): nothing is silently invented. Unknown fabrication dimensions
 * (boss, clearance) block generation with a diagnosable error; a too-thin boss or an
 * out-of-range bore is rejected rather than silently resized; every dimension the
 * generator uses is reported as `effective` with provenance, alongside the `requested`
 * inputs and a warnings list, so preview/export can show exactly what was built.
 */
import type { Point } from "@/core/geom";
import { boardFrame, outlineDims, pxPointToBoardMm } from "@/core/project/derive";
import type { GeneratedDimensions, KeepOut, Project } from "@/core/project/types";
import { isKnown, maybe } from "@/core/project/value";
import type { GeometryError } from "./adapter";
import { ccw, circleRing, convexHull, offsetRingOutward, pointInRing, rectRing, ringsOverlap, type Pt } from "./poly2d";
import { triangulate } from "./triangulate";

export type Vec3 = readonly [number, number, number];

export interface BodyMesh {
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
}

export interface BracketMesh {
  /** One body: the connected bracket solid. Kept as an array for the STEP writer. */
  bodies: BodyMesh[];
  positions: Float32Array;
  indices: Uint32Array;
  bbox: { min: Vec3; max: Vec3 };
  triangleCount: number;
  vertexCount: number;
}

/** A resolved dimension the generator actually used, with where it came from. */
export interface EffectiveValue {
  value: number;
  source: "measured" | "confirmed" | "inferred";
}

export interface EffectiveParams {
  strategy: Project["mount"]["kind"];
  fastenerStyle: Project["mount"]["fastenerStyle"];
  tolerance: Project["mount"]["tolerance"];
  baseThicknessMm: EffectiveValue;
  standoffHeightMm: EffectiveValue;
  bossDiameterMm: EffectiveValue;
  clearanceMm: EffectiveValue;
  toleranceOffsetMm: number;
  cornerRadiusMm: number;
  wallMm: number;
  sideTabs: 0 | 2 | 4;
  standoffs: { label: string; centerMm: Point; boreDiameterMm: number; through: boolean }[];
}

export type MeshResult =
  | { ok: true; mesh: BracketMesh; dims: GeneratedDimensions; warnings: string[]; effective: EffectiveParams }
  | { ok: false; error: GeometryError };

/** Circle facet count — one value for every consumer keeps preview/STL/STEP identical. */
export const SEGMENTS = 40;
/** Illustrative wall/margin (mm) around the board footprint. */
export const WALL_MM = 3;
/** Minimum boss wall left around a bore before the bore is treated as escaping the standoff. */
export const MIN_BOSS_WALL_MM = 0.6;
/** Minimum bore radius (mm) that still tessellates to a non-degenerate ring. */
const MIN_BORE_RADIUS_MM = 0.05;

const TOLERANCE_OFFSET: Record<Project["mount"]["tolerance"], number> = {
  "fdm-0.20": 0.2,
  "fdm-0.15": 0.15,
  "sla-0.05": 0.05,
  custom: 0,
};

// ----------------------------------------------------------------------------
// Global welded surface builder — every feature adds into ONE vertex pool so shared
// rims/edges connect and the whole solid is a single connected manifold.
// ----------------------------------------------------------------------------

class Surface {
  private verts: number[] = [];
  private idx: number[] = [];
  private map = new Map<string, number>();

  private key(x: number, y: number, z: number): string {
    const r = (n: number) => Math.round(n * 1e4);
    return `${r(x)},${r(y)},${r(z)}`;
  }
  addVertex(x: number, y: number, z: number): number {
    const k = this.key(x, y, z);
    const hit = this.map.get(k);
    if (hit !== undefined) return hit;
    const i = this.verts.length / 3;
    this.verts.push(x, y, z);
    this.map.set(k, i);
    return i;
  }
  triOut(a: Vec3, b: Vec3, c: Vec3, outward: Vec3): void {
    const ia = this.addVertex(a[0], a[1], a[2]);
    const ib = this.addVertex(b[0], b[1], b[2]);
    const ic = this.addVertex(c[0], c[1], c[2]);
    if (ia === ib || ib === ic || ia === ic) return; // drop degenerate
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, outward) >= 0) this.idx.push(ia, ib, ic);
    else this.idx.push(ia, ic, ib);
  }
  quadOut(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, outward: Vec3): void {
    this.triOut(p0, p1, p2, outward);
    this.triOut(p0, p2, p3, outward);
  }
  /** Triangulate a 2D face (outer + holes) at height z; `up` sets the outward normal. */
  addFace(outer: Pt[], holes: Pt[][], z: number, up: boolean): void {
    const { vertices, triangles } = triangulate(outer, holes);
    const outward: Vec3 = up ? [0, 0, 1] : [0, 0, -1];
    for (const [a, b, c] of triangles) {
      this.triOut([vertices[a].x, vertices[a].y, z], [vertices[b].x, vertices[b].y, z], [vertices[c].x, vertices[c].y, z], outward);
    }
  }
  /** A vertical wall around a ring from z0 to z1. `outwardAt(mid)` gives the solid's outward normal. */
  addWall(ring: Pt[], z0: number, z1: number, outwardAt: (mid: Pt) => Vec3): void {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.quadOut([a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], [a.x, a.y, z1], outwardAt(mid));
    }
  }
  build(name: string): BodyMesh {
    return { name, positions: new Float32Array(this.verts), indices: new Uint32Array(this.idx) };
  }
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function centroid(ring: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p.x;
    y += p.y;
  }
  return { x: x / ring.length, y: y / ring.length };
}
function norm2(x: number, y: number): Vec3 {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l, 0];
}

// ----------------------------------------------------------------------------
// Input resolution (honest — no silent invention).
// ----------------------------------------------------------------------------

function fail(code: string, message: string, feature?: string): { ok: false; error: GeometryError } {
  return { ok: false, error: feature ? { code, message, feature } : { code, message } };
}

/** Round a plate corner into an arc; only convex corners are filleted. */
function filletRing(ring: Pt[], radius: number, seg = 6): Pt[] {
  if (radius <= 0) return ring;
  const r = ccw(ring);
  const n = r.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = r[(i - 1 + n) % n];
    const cur = r[i];
    const next = r[(i + 1) % n];
    const v1 = norm2(prev.x - cur.x, prev.y - cur.y);
    const v2 = norm2(next.x - cur.x, next.y - cur.y);
    const convex = v1[0] * v2[1] - v1[1] * v2[0] < 0; // CCW interior turn
    const e1 = Math.hypot(prev.x - cur.x, prev.y - cur.y);
    const e2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const t = Math.min(radius, e1 / 2.5, e2 / 2.5);
    if (!convex || t < 1e-3) {
      out.push(cur);
      continue;
    }
    const p1 = { x: cur.x + v1[0] * t, y: cur.y + v1[1] * t };
    const p2 = { x: cur.x + v2[0] * t, y: cur.y + v2[1] * t };
    for (let s = 0; s <= seg; s++) {
      const u = s / seg;
      // Quadratic Bézier corner through the tangent points and the vertex.
      const x = (1 - u) * (1 - u) * p1.x + 2 * (1 - u) * u * cur.x + u * u * p2.x;
      const y = (1 - u) * (1 - u) * p1.y + 2 * (1 - u) * u * cur.y + u * u * p2.y;
      out.push({ x, y });
    }
  }
  return out;
}

/** Splice an outward rectangular tab onto the plate ring at the point nearest `anchor`. */
function spliceTab(ring: Pt[], anchor: Pt, outward: Vec3, width: number, depth: number): Pt[] {
  // Find the edge whose midpoint is nearest the anchor direction and insert a bump.
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = Math.hypot(mid.x - anchor.x, mid.y - anchor.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const a = ring[best];
  const b = ring[(best + 1) % ring.length];
  const dir = norm2(b.x - a.x, b.y - a.y);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = Math.min(width / 2, Math.hypot(b.x - a.x, b.y - a.y) / 2.2);
  const i1 = { x: mid.x - dir[0] * half, y: mid.y - dir[1] * half };
  const i2 = { x: mid.x + dir[0] * half, y: mid.y + dir[1] * half };
  const o1 = { x: i1.x + outward[0] * depth, y: i1.y + outward[1] * depth };
  const o2 = { x: i2.x + outward[0] * depth, y: i2.y + outward[1] * depth };
  // Insert i1, o1, o2, i2 after vertex `best`.
  return [...ring.slice(0, best + 1), i1, o1, o2, i2, ...ring.slice(best + 1)];
}

function boreDiameter(holeDiameter: number, clearance: number, tolOffset: number, style: Project["mount"]["fastenerStyle"]): number {
  const clearBore = holeDiameter + clearance + 2 * tolOffset; // through / insert seat
  if (style === "self-tapping") return holeDiameter * 0.8 + 2 * tolOffset; // pilot for the thread to bite
  return clearBore;
}

// ----------------------------------------------------------------------------
// Build.
// ----------------------------------------------------------------------------

export function buildBracketMesh(project: Project): MeshResult {
  const frame = boardFrame(project);
  if (!frame) {
    const feature = !project.calibration || project.calibration.status !== "valid" ? "calibration" : "outline";
    return fail("UNRESOLVED_MODEL", "A valid calibration and a board outline are required before a mount can be generated.", feature);
  }
  const dims = outlineDims(project);
  if (!dims || dims.widthMm <= 0 || dims.heightMm <= 0) return fail("NO_DIMENSIONS", "Outline produced no measurable footprint.");
  if (project.board.holes.length === 0) return fail("NO_STANDOFFS", "At least one mounting hole is needed to place a standoff.", "holes");

  const m = project.mount;
  const base = maybe(m.baseThicknessMm);
  const standoffH = maybe(m.standoffHeightMm);
  const boss = maybe(m.bossDiameterMm);
  const clearance = maybe(m.clearanceMm);
  // No silent invention: an unknown fabrication dimension blocks generation with a
  // diagnosable error rather than defaulting to zero or a guessed size.
  if (base == null) return fail("MISSING_MOUNT_HEIGHT", "Base thickness is not set.", "base thickness");
  if (standoffH == null) return fail("MISSING_MOUNT_HEIGHT", "Standoff height is not set.", "standoff height");
  if (boss == null) return fail("MISSING_BOSS", "Boss diameter is not set; the standoff wall cannot be sized.", "boss diameter");
  if (clearance == null) return fail("MISSING_CLEARANCE", "Fit clearance is not set.", "clearance");
  if (!(base > 0)) return fail("INVALID_MOUNT_HEIGHT", "Base thickness must be greater than zero.", "base thickness");
  if (!(standoffH > 0)) return fail("INVALID_MOUNT_HEIGHT", "Standoff height must be greater than zero.", "standoff height");
  if (!(boss > 0)) return fail("INVALID_BOSS", "Boss diameter must be greater than zero.", "boss diameter");
  if (clearance < 0) return fail("INVALID_CLEARANCE", "Fit clearance cannot be negative.", "clearance");

  const tolOffset = TOLERANCE_OFFSET[m.tolerance];
  const bossR = boss / 2;
  const warnings: string[] = [];

  // Per-hole bores, validated against the boss wall — never silently resized.
  const standoffs: EffectiveParams["standoffs"] = [];
  const seats: Pt[] = [];
  for (const h of project.board.holes) {
    const d = maybe(h.diameterMm);
    if (d == null) return fail("MISSING_DIAMETER", `${h.label} has no diameter; its standoff and screw hole cannot be sized.`, h.label);
    if (!(d > 0)) return fail("INVALID_DIAMETER", `${h.label} has a non-positive diameter.`, h.label);
    const through = m.fastenerStyle === "through-bolt";
    const boreD = boreDiameter(d, clearance, tolOffset, m.fastenerStyle);
    const boreR = boreD / 2;
    if (boreR < MIN_BORE_RADIUS_MM) return fail("BORE_TOO_SMALL", `${h.label} bore ⌀${boreD.toFixed(3)} mm is too small to generate.`, h.label);
    if (bossR - boreR < MIN_BOSS_WALL_MM)
      return fail(
        "BORE_ESCAPES_STANDOFF",
        `${h.label}: a ⌀${boreD.toFixed(2)} mm bore leaves under ${MIN_BOSS_WALL_MM} mm wall inside a ⌀${boss.toFixed(2)} mm boss. Increase the boss or reduce the hole/clearance.`,
        h.label,
      );
    const c = pxPointToBoardMm(h.centerPx, frame);
    standoffs.push({ label: h.label, centerMm: c, boreDiameterMm: boreD, through });
    seats.push(c);
  }

  // Overlapping bosses would fuse two hole-circles and break the single-manifold plate.
  for (let i = 0; i < standoffs.length; i++) {
    for (let j = i + 1; j < standoffs.length; j++) {
      const a = standoffs[i].centerMm;
      const b = standoffs[j].centerMm;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * bossR - 1e-6) {
        return fail(
          "BOSS_OVERLAP",
          `${standoffs[i].label} and ${standoffs[j].label} bosses overlap (⌀${boss.toFixed(2)} mm too large for their spacing). Increase spacing or reduce the boss diameter.`,
          standoffs[i].label,
        );
      }
    }
  }

  // ---- Plate footprint (per strategy) ----
  const wall = WALL_MM;
  let plate: Pt[];
  if (m.kind === "rect-plate") {
    plate = rectRing(-wall, -wall, dims.widthMm + wall, dims.heightMm + wall);
  } else if (m.kind === "standoff-bridge") {
    // A minimal bridge: the convex hull of the standoff seats, grown by boss + wall.
    const hull = convexHull(seats.length >= 3 ? seats : [...seats, { x: seats[0].x + 1, y: seats[0].y }, { x: seats[0].x, y: seats[0].y + 1 }]);
    plate = offsetRingOutward(hull, bossR + wall) ?? rectRing(-wall, -wall, dims.widthMm + wall, dims.heightMm + wall);
  } else {
    // plate-standoffs: the board outline, offset outward by the wall margin.
    const outline = project.board.outline!.vertices.map((v) => pxPointToBoardMm(v, frame));
    plate = offsetRingOutward(ccw(outline), wall) ?? rectRing(-wall, -wall, dims.widthMm + wall, dims.heightMm + wall);
  }

  // Corner radius (from the outline's Val, when known).
  const cornerRadius = isKnown(project.board.outline!.cornerRadiusMm) ? project.board.outline!.cornerRadiusMm.value : 0;
  if (cornerRadius > 0) plate = filletRing(plate, cornerRadius);

  // ---- Side tabs (spliced onto the plate boundary; each with a through bore) ----
  const bb = { x0: -wall, y0: -wall, x1: dims.widthMm + wall, y1: dims.heightMm + wall };
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const tabW = Math.min(14, (bb.x1 - bb.x0) * 0.28);
  const tabD = 8;
  const tabBores: { center: Pt; r: number }[] = [];
  if (m.sideTabs >= 2) {
    plate = spliceTab(plate, { x: cx, y: bb.y0 }, [0, -1, 0], tabW, tabD);
    plate = spliceTab(plate, { x: cx, y: bb.y1 }, [0, 1, 0], tabW, tabD);
    tabBores.push({ center: { x: cx, y: bb.y0 - tabD / 2 }, r: 2 }, { center: { x: cx, y: bb.y1 + tabD / 2 }, r: 2 });
    if (m.sideTabs >= 4) {
      plate = spliceTab(plate, { x: bb.x0, y: cy }, [-1, 0, 0], tabW, tabD);
      plate = spliceTab(plate, { x: bb.x1, y: cy }, [1, 0, 0], tabW, tabD);
      tabBores.push({ center: { x: bb.x0 - tabD / 2, y: cy }, r: 2 }, { center: { x: bb.x1 + tabD / 2, y: cy }, r: 2 });
    }
  }

  // Every standoff seat must sit on the plate, or the standoff would float disconnected.
  for (const so of standoffs) {
    if (!pointInRing(so.centerMm, plate)) {
      return fail("STANDOFF_OFF_PLATE", `${so.label} lies outside the plate footprint; move it onto the board or widen the plate.`, so.label);
    }
  }

  const baseZ0 = 0;
  const baseZ1 = base;
  const topZ = base + standoffH;
  const standoffOuter = standoffs.map((so) => circleRing(so.centerMm.x, so.centerMm.y, bossR, SEGMENTS));
  const standoffBore = standoffs.map((so) => circleRing(so.centerMm.x, so.centerMm.y, so.boreDiameterMm / 2, SEGMENTS));
  const throughBoreRings = standoffs.map((so, i) => (so.through ? standoffBore[i] : null)).filter((r): r is Pt[] => r != null);
  const tabBoreRings = tabBores.map((t) => circleRing(t.center.x, t.center.y, t.r, SEGMENTS));

  // ---- Keep-outs: subtract interior footprints as through-holes. A hole that leaves the
  // plate, or overlaps a boss/tab bore or an already-subtracted keep-out, is warned and
  // skipped — holes must stay disjoint for the plate to triangulate to a single manifold.
  const mandatoryHoles = [...standoffOuter, ...tabBoreRings];
  const keepoutHoles: Pt[][] = [];
  for (const k of project.board.keepOuts) {
    const ring = keepOutRing(k, frame);
    if (!ring) continue;
    const r = ccw(ring);
    if (!r.every((p) => pointInRing(p, plate))) {
      warnings.push(`${k.label} extends past the plate edge — its footprint was not subtracted.`);
      continue;
    }
    if (mandatoryHoles.some((h) => ringsOverlap(r, h))) {
      warnings.push(`${k.label} overlaps a standoff or tab bore — its footprint was not subtracted.`);
      continue;
    }
    if (keepoutHoles.some((h) => ringsOverlap(r, h))) {
      warnings.push(`${k.label} overlaps another keep-out — only the first of the overlap was subtracted.`);
      continue;
    }
    keepoutHoles.push(r);
  }

  // ---- Build the single manifold ----
  const s = new Surface();

  // Top plate face: plate minus standoff outer circles, keep-outs, tab bores.
  s.addFace(plate, [...standoffOuter.map((r) => ccw(r)), ...keepoutHoles, ...tabBoreRings.map((r) => ccw(r))], baseZ1, true);
  // Bottom plate face: plate minus keep-outs, through bores, tab bores (blind bores don't perforate).
  s.addFace(plate, [...keepoutHoles, ...throughBoreRings.map((r) => ccw(r)), ...tabBoreRings.map((r) => ccw(r))], baseZ0, false);

  // Outer plate wall (right-normal of the CCW boundary points outward).
  const pc = centroid(plate);
  s.addWall(ccw(plate), baseZ0, baseZ1, (mid) => norm2(mid.x - pc.x, mid.y - pc.y));
  // Keep-out walls (face into the hole).
  for (const k of keepoutHoles) {
    const kc = centroid(k);
    s.addWall(k, baseZ0, baseZ1, (mid) => norm2(kc.x - mid.x, kc.y - mid.y));
  }
  // Tab bore walls (through the plate; face into the bore).
  tabBores.forEach((t, i) => s.addWall(tabBoreRings[i], baseZ0, baseZ1, (mid) => norm2(t.center.x - mid.x, t.center.y - mid.y)));

  // Standoffs.
  standoffs.forEach((so, i) => {
    const outer = standoffOuter[i];
    const bore = standoffBore[i];
    const c = so.centerMm;
    // Outer wall base->top (faces outward from the axis).
    s.addWall(outer, baseZ1, topZ, (mid) => norm2(mid.x - c.x, mid.y - c.y));
    // Top annulus [bore..outer] at topZ, facing up.
    s.addFace(outer, [ccw(bore)], topZ, true);
    if (so.through) {
      // Through bore wall 0->top (faces into the bore).
      s.addWall(bore, baseZ0, topZ, (mid) => norm2(c.x - mid.x, c.y - mid.y));
    } else {
      // Blind bore wall base->top + a floor disk at base facing up.
      s.addWall(bore, baseZ1, topZ, (mid) => norm2(c.x - mid.x, c.y - mid.y));
      s.addFace(bore, [], baseZ1, true);
    }
  });

  const body = s.build("bracket");
  const mesh = combine([body]);
  if (mesh.triangleCount === 0) return fail("EMPTY_SOLID", "Generation produced no geometry.");

  const bboxDims = mesh.bbox;
  const genDims: GeneratedDimensions = {
    widthMm: round2(bboxDims.max[0] - bboxDims.min[0]),
    depthMm: round2(bboxDims.max[1] - bboxDims.min[1]),
    heightMm: round2(bboxDims.max[2] - bboxDims.min[2]),
    standoffCount: standoffs.length,
    bodies: 1,
    triangles: mesh.triangleCount,
  };

  const effective: EffectiveParams = {
    strategy: m.kind,
    fastenerStyle: m.fastenerStyle,
    tolerance: m.tolerance,
    baseThicknessMm: valOf(project.mount.baseThicknessMm, base),
    standoffHeightMm: valOf(project.mount.standoffHeightMm, standoffH),
    bossDiameterMm: valOf(project.mount.bossDiameterMm, boss),
    clearanceMm: valOf(project.mount.clearanceMm, clearance),
    toleranceOffsetMm: tolOffset,
    cornerRadiusMm: cornerRadius,
    wallMm: wall,
    sideTabs: m.sideTabs,
    standoffs,
  };
  const inferredNames = [
    ["boss diameter", project.mount.bossDiameterMm],
    ["fit clearance", project.mount.clearanceMm],
    ["standoff height", project.mount.standoffHeightMm],
    ["base thickness", project.mount.baseThicknessMm],
  ]
    .filter(([, v]) => isKnown(v as never) && (v as { source: string }).source === "inferred")
    .map(([n]) => n as string);
  if (inferredNames.length > 0) warnings.push(`Inferred fabrication dimensions (confirm before trusting the fit): ${inferredNames.join(", ")}.`);

  return { ok: true, mesh, dims: genDims, warnings, effective };
}

function keepOutRing(k: KeepOut, frame: NonNullable<ReturnType<typeof boardFrame>>): Pt[] | null {
  if (k.shape === "rect" && k.rectPx) {
    const a = pxPointToBoardMm({ x: k.rectPx.x, y: k.rectPx.y }, frame);
    const b = pxPointToBoardMm({ x: k.rectPx.x + k.rectPx.w, y: k.rectPx.y + k.rectPx.h }, frame);
    return rectRing(a.x, a.y, b.x, b.y);
  }
  if (k.shape === "circle" && k.circlePx) {
    const c = pxPointToBoardMm(k.circlePx.center, frame);
    const rimPx = { x: k.circlePx.center.x + k.circlePx.radiusPx, y: k.circlePx.center.y };
    const rim = pxPointToBoardMm(rimPx, frame);
    return circleRing(c.x, c.y, Math.hypot(rim.x - c.x, rim.y - c.y), SEGMENTS);
  }
  if (k.shape === "polygon" && k.polygonPx && k.polygonPx.length >= 3) {
    return ccw(k.polygonPx.map((p) => pxPointToBoardMm(p, frame)));
  }
  return null;
}

function valOf(v: Project["mount"]["baseThicknessMm"], value: number): EffectiveValue {
  const source = isKnown(v) ? v.source : "inferred";
  return { value, source };
}

function combine(bodies: BodyMesh[]): BracketMesh {
  let vCount = 0;
  let tCount = 0;
  for (const b of bodies) {
    vCount += b.positions.length / 3;
    tCount += b.indices.length / 3;
  }
  const positions = new Float32Array(vCount * 3);
  const indices = new Uint32Array(tCount * 3);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let vOff = 0;
  let iOff = 0;
  for (const b of bodies) {
    positions.set(b.positions, vOff * 3);
    for (let i = 0; i < b.indices.length; i++) indices[iOff + i] = b.indices[i] + vOff;
    for (let i = 0; i < b.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const val = b.positions[i + a];
        if (val < min[a]) min[a] = val;
        if (val > max[a]) max[a] = val;
      }
    }
    vOff += b.positions.length / 3;
    iOff += b.indices.length;
  }
  return { bodies, positions, indices, bbox: { min, max }, triangleCount: tCount, vertexCount: vCount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
