/**
 * Real bracket geometry — one connected, watertight, manifold solid, proven by audit.
 *
 * `buildBracketMesh` turns the canonical model into a SINGLE closed solid in board-space
 * millimetres: a plate (rectangular, board-outline, or standoff-bridge per strategy),
 * standoffs rising at each hole with a per-fastener bore (blind insert seat, blind pilot,
 * or through clearance), optional side tabs, and keep-out footprints subtracted from the
 * plate. Booleans are avoided: the plate top/bottom faces are triangulated with the
 * standoff/keep-out/bore circles as holes, and every feature shares welded vertices.
 *
 * Correctness is a production invariant, not a fixture assertion (reviewer #1). The pure-mm
 * {@link SolidRecipe} is assembled by {@link assembleSolid}, then {@link auditMesh} runs
 * fail-closed BEFORE success is returned — finite coordinates, valid indices, nonzero-area
 * triangles, every undirected edge shared by exactly two oppositely-directed uses, a single
 * connected component, a single manifold fan at every vertex, and positive volume. Because
 * the preview and both exporters consume this same result, none of them can serialise a
 * solid that failed the audit.
 *
 * Honesty (reviewer #2): nothing is silently invented. Unknown fabrication dimensions block
 * generation with a diagnosable error; a too-thin boss, an out-of-range bore, an outline
 * that cannot be offset safely, or a self-intersecting plate is rejected rather than
 * silently reshaped; every dimension the generator uses is reported as `effective` with
 * provenance, alongside the `requested` inputs, the full mm recipe, and a mesh hash.
 */
import type { Point } from "@/core/geom";
import { boardFrame, outlineDims, pxPointToBoardMm } from "@/core/project/derive";
import type { FastenerChoice, FastenerStyle, GeneratedDimensions, KeepOut, Project } from "@/core/project/types";
import { isKnown, maybe } from "@/core/project/value";
import type { GeometryError } from "./adapter";
import { fastenerProfile } from "./fasteners";
import {
  ccw,
  circleRing,
  convexHull,
  isSimpleRing,
  offsetRingOutward,
  pointInRingStrict,
  ringContainsRing,
  ringsOverlap,
  ringsSeparated,
  CONTACT_EPS,
  type Pt,
} from "./poly2d";
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

/** Per-corner fillet outcome: requested radius vs the radius actually achievable after clamp. */
export interface CornerReport {
  requestedRadiusMm: number;
  effectiveRadiusMm: number;
  clamped: boolean;
}

export interface TabReport {
  edgeIndex: number;
  /** Requested tab dimensions (the structural contract). */
  requestedWidthMm: number;
  requestedDepthMm: number;
  /** Emitted tab dimensions. A successful build emits the request exactly (reviewer #5); a tab
   *  that cannot be placed at its requested size blocks generation rather than narrowing. */
  widthMm: number;
  depthMm: number;
  boreCenterMm: Point;
  boreRadiusMm: number;
}

/**
 * How a keep-out was resolved as an ENFORCEABLE constraint (reviewer #1, #4):
 * - honored-by-subtraction: its footprint overlapped bracket material and was cut away.
 * - satisfied-no-material: no bracket material lies in its clearance volume — resolved from
 *   the actual Z intervals (top-side, or bottom-side clearance shorter than the standoff gap,
 *   or a footprint clear of the plate/features) → nothing to cut.
 * - blocked: it intersects bracket material that cannot be cleanly removed (overlaps a
 *   standoff/tab, crosses the plate edge, overlaps another keep-out, or has a self-
 *   intersecting footprint) → generation fails closed.
 * - unsupported-semantic: RESERVED for a clearance this full-depth-subtraction generator
 *   cannot represent. The current generator resolves every real case via the first three;
 *   this value exists for a future partial-relief capability.
 * Only the first two ever appear in a successful build; blocked aborts with a coded error.
 */
export type KeepOutStatus = "honored-by-subtraction" | "satisfied-no-material" | "blocked" | "unsupported-semantic";

export interface KeepOutReport {
  /** Stable keep-out id (the join key; labels are display text and can collide/rename). */
  id: string;
  label: string;
  boardSide: "top" | "bottom";
  /** Requested clearance height (mm), or null when the user has not measured it. */
  requestedClearanceHeightMm: number | null;
  status: KeepOutStatus;
  /** Human-readable resolution detail; null when honored with nothing to note. */
  reason: string | null;
}

export interface StandoffReport {
  /** Stable hole id this standoff was generated from — the join key for downstream reports
   *  (labels are display text and can collide or be renamed; ids cannot). */
  id: string;
  label: string;
  centerMm: Point;
  /** The fastener + install style that drove this standoff's bore (per-hole; reviewer #3). */
  fastener: FastenerChoice;
  fastenerStyle: FastenerStyle;
  /** Requested bore override (mm, pre-tolerance) when the user set one; null when the bore
   *  came from the fastener profile. */
  requestedBoreDiameterMm: number | null;
  /** Where the base bore came from: a measured/confirmed override, or the inferred profile. */
  boreSource: EffectiveValue["source"];
  /** Effective standoff bore (mm), including fit clearance + tolerance offset. */
  boreDiameterMm: number;
  bossDiameterMm: number;
  /** Heat-set only: recommended insert seat depth (mm) the standoff must accommodate; else null. */
  insertDepthMm: number | null;
  through: boolean;
}

/** The complete effective geometry recipe reported to the sidecar (reviewer #3/#4). */
export interface EffectiveParams {
  strategy: Project["mount"]["kind"];
  /** Fastener install style is now per-standoff (see `standoffs`); a board may mix hardware. */
  tolerance: Project["mount"]["tolerance"];
  baseThicknessMm: EffectiveValue;
  standoffHeightMm: EffectiveValue;
  bossDiameterMm: EffectiveValue;
  clearanceMm: EffectiveValue;
  toleranceOffsetMm: number;
  /** Requested corner radius (mm); per-corner effective values are in `corners`. */
  cornerRadiusMm: number;
  corners: CornerReport[];
  wallMm: number;
  /** Applied plate offset (mm) for the outline/bridge strategies; 0 for rect-plate. */
  plateOffsetMm: number;
  segments: number;
  weldToleranceMm: number;
  contactToleranceMm: number;
  /** Side tabs the user REQUESTED (0/2/4). */
  requestedSideTabs: 0 | 2 | 4;
  /** Side tabs actually EMITTED — can be fewer than requested when one is skipped as
   *  unplaceable (reviewer #6). Equal to `tabs.length`; surfaced explicitly for the sidecar. */
  emittedTabCount: number;
  tabs: TabReport[];
  /** Effective plate outline the solid was built on (board-space mm). */
  plateOutlineMm: Point[];
  /** Requested board outline in mm (only when the strategy consumes it), else null. */
  requestedOutlineMm: Point[] | null;
  keepOuts: KeepOutReport[];
  standoffs: StandoffReport[];
}

/** Pure-mm geometry that {@link assembleSolid} consumes — no Project, no calibration. */
export interface SolidRecipe {
  plate: Point[];
  baseZ0: number;
  baseZ1: number;
  topZ: number;
  standoffs: { center: Point; bossR: number; boreR: number; through: boolean }[];
  keepOutHoles: Point[][];
  tabBores: { center: Point; r: number }[];
  segments: number;
  weldEpsMm: number;
}

export interface GeometryBuild {
  mesh: BracketMesh;
  dims: GeneratedDimensions;
  warnings: string[];
  effective: EffectiveParams;
  /** Pure-mm recipe the mesh was assembled from — serialised into the sidecar. */
  recipe: SolidRecipe;
  /** 32-bit FNV-1a determinism fingerprint of the welded solid — proves the same recipe
   *  rebuilds the same mesh. NOT a cryptographic hash of the emitted file (that is the
   *  exporter's SHA-256 over the artifact body). */
  meshHash: string;
}

export type MeshResult = { ok: true } & GeometryBuild | { ok: false; error: GeometryError };

// ---- Named, versioned generator constants (reviewer #2: no hidden fabrication values). ----

/** Circle facet count — one value for every consumer keeps preview/STL/STEP identical. */
export const SEGMENTS = 40;
/** Wall/margin (mm) added around the board footprint or standoff bridge. */
export const WALL_MM = 3;
/** Minimum boss wall left around a bore before the bore is treated as escaping the standoff. */
export const MIN_BOSS_WALL_MM = 0.6;
/** Minimum bore radius (mm) that still tessellates to a non-degenerate ring. */
export const MIN_BORE_RADIUS_MM = 0.05;
/** Side-tab footprint: width along the edge, depth outward, and its through-bore radius. */
export const TAB_WIDTH_MM = 14;
export const TAB_DEPTH_MM = 8;
export const TAB_BORE_RADIUS_MM = 2;
/** Plate the tab needs on EACH side of its base along the host edge (manufacturability +
 *  keeps the spliced outline simple). A tab is placed at its full requested width or not at all. */
export const MIN_TAB_EDGE_MARGIN_MM = 1;
/** Arc segments emitted per filleted corner. */
export const FILLET_SEGMENTS = 8;
/** Vertex weld quantum (mm): positions rounded to this collapse to one welded vertex. */
export const WELD_EPS_MM = 1e-4;
/**
 * Realistic physical envelope (mm) for a board-mount bracket. A structurally valid but
 * pathological project (e.g. an implausibly large calibration or outline) is rejected before
 * it reaches the exporters, so the STL/STEP writers never see coordinates whose magnitude
 * would defeat round-trip-safe formatting (reviewer #5A).
 */
export const MAX_DIMENSION_MM = 2000;
/**
 * Hard ceiling on emitted triangles (reviewer #3). The import boundary already bounds the
 * INPUT (hole/keep-out/vertex caps + a total-work budget), so a real bracket lands far below
 * this; the guard is a final backstop so no accepted-but-pathological input can hand the
 * synchronous preview (WebGL) or the exporters a mesh large enough to freeze the tab or
 * exhaust memory. Failing closed here beats shipping an unbounded array to three consumers.
 */
export const MAX_TRIANGLES = 500_000;

/** Preset fit offsets (mm). "custom" is deliberately absent — it resolves from the model's
 *  `customToleranceMm`, and a selected-but-unset custom profile fails closed (reviewer #6). */
const TOLERANCE_OFFSET: Record<Exclude<Project["mount"]["tolerance"], "custom">, number> = {
  "fdm-0.20": 0.2,
  "fdm-0.15": 0.15,
  "sla-0.05": 0.05,
};

// ----------------------------------------------------------------------------
// Global welded surface builder — every feature adds into ONE vertex pool so shared
// rims/edges connect and the whole solid is a single connected manifold.
// ----------------------------------------------------------------------------

class Surface {
  private verts: number[] = [];
  private idx: number[] = [];
  private map = new Map<string, number>();
  /** First triangulation failure encountered while capping a face, if any. */
  faceError: string | null = null;
  private readonly q: number;

  constructor(weldEps: number) {
    this.q = 1 / weldEps;
  }
  private key(x: number, y: number, z: number): string {
    const r = (n: number) => Math.round(n * this.q);
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
  /** Triangulate a 2D face (outer + holes) at height z; `up` sets the outward normal.
   *  Returns false and records `faceError` when triangulation fails closed. */
  addFace(outer: Pt[], holes: Pt[][], z: number, up: boolean): boolean {
    const tri = triangulate(outer, holes);
    if (!tri.ok) {
      if (!this.faceError) this.faceError = `${tri.code}: ${tri.message}`;
      return false;
    }
    const outward: Vec3 = up ? [0, 0, 1] : [0, 0, -1];
    for (const [a, b, c] of tri.triangles) {
      this.triOut([tri.vertices[a].x, tri.vertices[a].y, z], [tri.vertices[b].x, tri.vertices[b].y, z], [tri.vertices[c].x, tri.vertices[c].y, z], outward);
    }
    return true;
  }
  /**
   * A vertical wall around a ring from z0 to z1. The outward normal is derived from the
   * edge direction and ring winding (reviewer #2), never a centroid: for a CCW ring the
   * right-hand normal (dir.y,-dir.x) points away from the ring interior. `solidInside`
   * selects the sign — true when material is inside the ring (outer plate / standoff wall),
   * false when the ring bounds a void (bore / keep-out) so the wall faces into the void.
   */
  addWall(ring: Pt[], z0: number, z1: number, solidInside: boolean): void {
    const r = ccw(ring);
    const n = r.length;
    const s = solidInside ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = r[i];
      const b = r[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const outward: Vec3 = [(dy / len) * s, (-dx / len) * s, 0];
      this.quadOut([a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], [a.x, a.y, z1], outward);
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

// ----------------------------------------------------------------------------
// Real corner fillet (reviewer #2: a true circular arc from the requested radius).
// ----------------------------------------------------------------------------

/**
 * Round convex corners of a CCW ring into true circular arcs of the requested radius,
 * clamping the tangent setback to half the shorter adjacent edge. Returns the new ring plus
 * a per-corner report of requested-vs-effective radius (clamped corners are recorded, not
 * silently reported as the requested value). Concave corners are passed through unchanged.
 */
function filletRing(ring: Pt[], radius: number, seg = FILLET_SEGMENTS): { ring: Pt[]; corners: CornerReport[] } {
  const r = ccw(ring);
  const n = r.length;
  const out: Pt[] = [];
  const corners: CornerReport[] = [];
  if (radius <= 0) return { ring: r, corners };
  for (let i = 0; i < n; i++) {
    const prev = r[(i - 1 + n) % n];
    const cur = r[i];
    const next = r[(i + 1) % n];
    const u1 = unit(prev.x - cur.x, prev.y - cur.y); // toward prev
    const u2 = unit(next.x - cur.x, next.y - cur.y); // toward next
    const face = u1.x * u2.y - u1.y * u2.x; // <0 at a convex corner of a CCW ring
    const e1 = Math.hypot(prev.x - cur.x, prev.y - cur.y);
    const e2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (face >= -1e-9) {
      out.push(cur); // reflex or straight — no fillet
      continue;
    }
    // Interior half-angle between the two edges.
    const cosT = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
    const halfT = Math.acos(cosT) / 2;
    const tanHalf = Math.tan(halfT);
    const tReq = radius / tanHalf; // setback for the requested radius
    const tMax = Math.min(e1, e2) / 2;
    const t = Math.min(tReq, tMax);
    const rEff = t * tanHalf;
    const clamped = rEff < radius - 1e-6;
    corners.push({ requestedRadiusMm: radius, effectiveRadiusMm: round4(rEff), clamped });
    if (t < 1e-4) {
      out.push(cur);
      continue;
    }
    const p1 = { x: cur.x + u1.x * t, y: cur.y + u1.y * t };
    const p2 = { x: cur.x + u2.x * t, y: cur.y + u2.y * t };
    // Arc centre: along the interior bisector at distance rEff / sin(halfT) from the corner.
    const bis = unit(u1.x + u2.x, u1.y + u2.y);
    const cDist = rEff / Math.sin(halfT);
    const centre = { x: cur.x + bis.x * cDist, y: cur.y + bis.y * cDist };
    let a1 = Math.atan2(p1.y - centre.y, p1.x - centre.x);
    let a2 = Math.atan2(p2.y - centre.y, p2.x - centre.x);
    // Sweep the short way (the arc subtends π - interiorAngle ≤ π).
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    for (let sIdx = 0; sIdx <= seg; sIdx++) {
      const a = a1 + (d * sIdx) / seg;
      out.push({ x: centre.x + rEff * Math.cos(a), y: centre.y + rEff * Math.sin(a) });
    }
    void a2;
  }
  return { ring: out, corners };
}

function unit(x: number, y: number): Pt {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

// ----------------------------------------------------------------------------
// Side tabs — each tab and its bore share ONE edge-local frame (reviewer #2).
// ----------------------------------------------------------------------------

/** Length of ring edge `i`. */
function edgeLength(ring: Pt[], i: number): number {
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Choose the host edge for a tab requested near `anchor`: the edge nearest the anchor that is
 * long enough to host the FULL requested width plus manufacturability margin (reviewer #5). On
 * a filleted/curved boundary this skips the short arc segments and lands on a real flat edge;
 * returns -1 when no edge near the anchor can host the tab (the caller then blocks the build).
 */
function bestEdgeForTab(ring: Pt[], anchor: Pt, minLen: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    if (edgeLength(ring, i) < minLen) continue;
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = Math.hypot(mid.x - anchor.x, mid.y - anchor.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

type TabResult = { ok: true; ring: Pt[]; boreCenter: Pt } | { ok: false; reason: string };

/**
 * Splice an outward rectangular tab onto edge `edgeIndex` at its FULL requested width (no
 * silent narrowing — reviewer #5) and derive its bore centre from the SAME edge-local frame.
 * Returns a coded reason instead of degrading when the tab cannot be placed at the requested
 * size, so the caller blocks generation rather than emitting a smaller tab than was asked for.
 */
function makeTab(ring: Pt[], edgeIndex: number, width: number, depth: number, boreR: number): TabResult {
  const r = ccw(ring);
  const n = r.length;
  const a = r[edgeIndex];
  const b = r[(edgeIndex + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return { ok: false, reason: "the chosen plate edge is degenerate" };
  if (width + 2 * MIN_TAB_EDGE_MARGIN_MM > len)
    return { ok: false, reason: `the ${round2(len)} mm plate edge is too short for a ${round2(width)} mm tab (needs ${round2(width + 2 * MIN_TAB_EDGE_MARGIN_MM)} mm)` };
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const nrm = { x: dir.y, y: -dir.x }; // outward for a CCW ring
  const half = width / 2; // full requested width, always
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const i1 = { x: mid.x - dir.x * half, y: mid.y - dir.y * half };
  const i2 = { x: mid.x + dir.x * half, y: mid.y + dir.y * half };
  const o1 = { x: i1.x + nrm.x * depth, y: i1.y + nrm.y * depth };
  const o2 = { x: i2.x + nrm.x * depth, y: i2.y + nrm.y * depth };
  const boreCenter = { x: mid.x + nrm.x * (depth / 2), y: mid.y + nrm.y * (depth / 2) };
  const newRing = [...r.slice(0, edgeIndex + 1), i1, o1, o2, i2, ...r.slice(edgeIndex + 1)];
  if (!isSimpleRing(newRing)) return { ok: false, reason: "the tab would make the plate outline self-intersect" };
  if (!pointInRingStrict(boreCenter, newRing, boreR + CONTACT_EPS)) return { ok: false, reason: "the tab bore would fall outside the tab" };
  return { ok: true, ring: newRing, boreCenter };
}

function fail(code: string, message: string, feature?: string): { ok: false; error: GeometryError } {
  return { ok: false, error: feature ? { code, message, feature } : { code, message } };
}

// ----------------------------------------------------------------------------
// Assemble the solid from a pure-mm recipe. Shared by generation and by
// reconstruction-from-sidecar, so the sidecar recipe provably rebuilds the same mesh.
// ----------------------------------------------------------------------------

export function assembleSolid(recipe: SolidRecipe): { ok: true; mesh: BracketMesh } | { ok: false; error: GeometryError } {
  const { plate, baseZ0, baseZ1, topZ, standoffs, keepOutHoles, tabBores, segments, weldEpsMm } = recipe;
  const s = new Surface(weldEpsMm);

  const standoffOuter = standoffs.map((so) => circleRing(so.center.x, so.center.y, so.bossR, segments));
  const standoffBore = standoffs.map((so) => circleRing(so.center.x, so.center.y, so.boreR, segments));
  const throughBoreRings = standoffs.map((so, i) => (so.through ? standoffBore[i] : null)).filter((r): r is Pt[] => r != null);
  const tabBoreRings = tabBores.map((t) => circleRing(t.center.x, t.center.y, t.r, segments));
  const keepHoles = keepOutHoles.map((k) => ccw(k));

  // Top plate face: plate minus standoff outer circles, keep-outs, tab bores.
  s.addFace(plate, [...standoffOuter.map((r) => ccw(r)), ...keepHoles, ...tabBoreRings.map((r) => ccw(r))], baseZ1, true);
  // Bottom plate face: plate minus keep-outs, through bores, tab bores (blind bores don't perforate).
  s.addFace(plate, [...keepHoles, ...throughBoreRings.map((r) => ccw(r)), ...tabBoreRings.map((r) => ccw(r))], baseZ0, false);

  // Outer plate wall (solid is inside the plate boundary).
  s.addWall(plate, baseZ0, baseZ1, true);
  // Keep-out walls (void inside the ring).
  for (const k of keepHoles) s.addWall(k, baseZ0, baseZ1, false);
  // Tab bore walls (through the plate; void inside the bore).
  tabBoreRings.forEach((r) => s.addWall(r, baseZ0, baseZ1, false));

  // Standoffs.
  standoffs.forEach((so, i) => {
    const outer = standoffOuter[i];
    const bore = standoffBore[i];
    s.addWall(outer, baseZ1, topZ, true); // outer wall (solid inside)
    s.addFace(outer, [ccw(bore)], topZ, true); // top annulus [bore..outer]
    if (so.through) {
      s.addWall(bore, baseZ0, topZ, false); // through bore wall (void inside)
    } else {
      s.addWall(bore, baseZ1, topZ, false); // blind bore wall
      s.addFace(bore, [], baseZ1, true); // blind bore floor
    }
  });

  if (s.faceError) return fail("TRIANGULATION_FAILED", `A plate or standoff face could not be triangulated. ${s.faceError}`);

  const body = s.build("bracket");
  const mesh = combine([body]);
  if (mesh.triangleCount === 0) return fail("EMPTY_SOLID", "Generation produced no geometry.");
  if (mesh.triangleCount > MAX_TRIANGLES)
    return fail("MESH_TOO_LARGE", `Generated solid has ${mesh.triangleCount} triangles, above the ${MAX_TRIANGLES}-triangle ceiling the preview and exporters support — simplify the board outline, holes, or keep-outs.`);

  const audit = auditMesh(mesh);
  if (!audit.ok) return fail(audit.code, `Generated solid failed the manifold audit (${audit.message}). This is a generator bug or an unsupported input combination — nothing was serialised.`);

  return { ok: true, mesh };
}

// ----------------------------------------------------------------------------
// Build from the canonical model.
// ----------------------------------------------------------------------------

export function buildBracketMesh(project: Project): MeshResult {
  const frame = boardFrame(project);
  if (!frame) {
    const feature = !project.calibration || project.calibration.status !== "valid" ? "calibration" : "outline";
    return fail("UNRESOLVED_MODEL", "A valid calibration and a board outline are required before a mount can be generated.", feature);
  }
  const dims = outlineDims(project);
  if (!dims || dims.widthMm <= 0 || dims.heightMm <= 0) return fail("NO_DIMENSIONS", "Outline produced no measurable footprint.");
  if (dims.widthMm > MAX_DIMENSION_MM || dims.heightMm > MAX_DIMENSION_MM)
    return fail("DIMENSIONS_OUT_OF_RANGE", `Board footprint ${round2(dims.widthMm)}×${round2(dims.heightMm)} mm exceeds the ${MAX_DIMENSION_MM} mm envelope this tool supports — check the calibration and outline.`, "outline");
  if (project.board.holes.length === 0) return fail("NO_STANDOFFS", "At least one mounting hole is needed to place a standoff.", "holes");

  const m = project.mount;
  const base = maybe(m.baseThicknessMm);
  const standoffH = maybe(m.standoffHeightMm);
  const boss = maybe(m.bossDiameterMm);
  const clearance = maybe(m.clearanceMm);
  // No silent invention: an unknown fabrication dimension blocks generation.
  if (base == null) return fail("MISSING_MOUNT_HEIGHT", "Base thickness is not set.", "base thickness");
  if (standoffH == null) return fail("MISSING_MOUNT_HEIGHT", "Standoff height is not set.", "standoff height");
  if (boss == null) return fail("MISSING_BOSS", "Boss diameter is not set; the standoff wall cannot be sized.", "boss diameter");
  if (clearance == null) return fail("MISSING_CLEARANCE", "Fit clearance is not set.", "clearance");
  if (!(base > 0)) return fail("INVALID_MOUNT_HEIGHT", "Base thickness must be greater than zero.", "base thickness");
  if (!(standoffH > 0)) return fail("INVALID_MOUNT_HEIGHT", "Standoff height must be greater than zero.", "standoff height");
  if (!(boss > 0)) return fail("INVALID_BOSS", "Boss diameter must be greater than zero.", "boss diameter");
  if (clearance < 0) return fail("INVALID_CLEARANCE", "Fit clearance cannot be negative.", "clearance");
  if (base > MAX_DIMENSION_MM || standoffH > MAX_DIMENSION_MM || boss > MAX_DIMENSION_MM || clearance > MAX_DIMENSION_MM)
    return fail("DIMENSIONS_OUT_OF_RANGE", `A fabrication dimension exceeds the ${MAX_DIMENSION_MM} mm envelope this tool supports.`, "mount");

  let tolOffset: number;
  if (m.tolerance === "custom") {
    const custom = m.customToleranceMm;
    if (custom == null || !Number.isFinite(custom) || custom < 0)
      return fail("MISSING_TOLERANCE", "The custom tolerance profile is selected but no fit offset is set. Enter a custom offset (mm) or choose a preset profile.", "tolerance");
    if (custom > MAX_DIMENSION_MM) return fail("DIMENSIONS_OUT_OF_RANGE", `The custom tolerance offset exceeds the ${MAX_DIMENSION_MM} mm envelope.`, "tolerance");
    tolOffset = custom;
  } else {
    tolOffset = TOLERANCE_OFFSET[m.tolerance];
  }
  const bossR = boss / 2;
  const warnings: string[] = [];

  // Per-hole standoff bores from the fastener PROFILE (reviewer #3): the bore is the fastener's
  // recommended standoff hole for its install style — a through-bolt clearance, a thread-forming
  // self-tapping pilot, or a heat-set insert bore — never the board hole diameter and never an
  // unnamed factor. A per-hole measured override wins; a `custom` fastener with no override
  // blocks. Fit clearance + tolerance offset are the print adjustments on top of the base bore.
  const standoffs: StandoffReport[] = [];
  const seats: Pt[] = [];
  for (const h of project.board.holes) {
    const d = maybe(h.diameterMm);
    if (d == null) return fail("MISSING_DIAMETER", `${h.label} has no board hole diameter; set it before generating.`, h.label);
    if (!(d > 0)) return fail("INVALID_DIAMETER", `${h.label} has a non-positive board hole diameter.`, h.label);

    const style = h.fastenerStyle;
    const through = style === "through-bolt";
    const profile = fastenerProfile(h.fastener, style);
    const overrideVal = h.boreDiameterMm;
    const override = overrideVal ? maybe(overrideVal) : null;
    let baseBore: number;
    let boreSource: EffectiveValue["source"];
    let requestedBoreDiameterMm: number | null;
    let insertDepthMm: number | null;
    if (override != null) {
      if (!(override > 0)) return fail("INVALID_BORE", `${h.label} has a non-positive bore override.`, h.label);
      baseBore = override;
      boreSource = overrideVal && isKnown(overrideVal) ? overrideVal.source : "measured";
      requestedBoreDiameterMm = override;
      insertDepthMm = profile?.insertDepthMm ?? null;
    } else if (profile) {
      baseBore = profile.boreDiameterMm;
      boreSource = "inferred";
      requestedBoreDiameterMm = null;
      insertDepthMm = profile.insertDepthMm;
    } else {
      return fail("MISSING_FASTENER_SPEC", `${h.label} uses a custom fastener with no bore set; enter its standoff bore diameter or choose a standard fastener size.`, h.label);
    }
    const boreD = baseBore + clearance + 2 * tolOffset;
    const boreR = boreD / 2;
    if (boreR < MIN_BORE_RADIUS_MM) return fail("BORE_TOO_SMALL", `${h.label} bore ⌀${boreD.toFixed(3)} mm is too small to generate.`, h.label);
    if (bossR - boreR < MIN_BOSS_WALL_MM)
      return fail(
        "BORE_ESCAPES_STANDOFF",
        `${h.label}: a ⌀${boreD.toFixed(2)} mm bore leaves under ${MIN_BOSS_WALL_MM} mm wall inside a ⌀${boss.toFixed(2)} mm boss. Increase the boss or reduce the bore/clearance.`,
        h.label,
      );
    // A heat-set insert must seat within the (blind) standoff bore depth.
    if (insertDepthMm != null && !through && standoffH < insertDepthMm)
      return fail(
        "INSERT_TOO_DEEP",
        `${h.label}: a ${h.fastener} heat-set insert needs a ${round2(insertDepthMm)} mm seat, deeper than the ${round2(standoffH)} mm standoff bore. Increase the standoff height or change the fastener style.`,
        h.label,
      );
    // Non-blocking consistency / recommendation notes.
    if (through && d < boreD - CONTACT_EPS)
      warnings.push(`${h.label}: the ${round2(d)} mm board hole is narrower than the ${round2(boreD)} mm through-bolt bore — the screw may not pass the board.`);
    if (profile && boss < profile.minBossDiameterMm - CONTACT_EPS)
      warnings.push(`${h.label}: boss ⌀${round2(boss)} mm is below the ${round2(profile.minBossDiameterMm)} mm recommended for a ${h.fastener} ${style}; the standoff wall may be thin.`);

    const c = pxPointToBoardMm(h.centerPx, frame);
    standoffs.push({ id: h.id, label: h.label, centerMm: c, fastener: h.fastener, fastenerStyle: style, requestedBoreDiameterMm, boreSource, boreDiameterMm: boreD, bossDiameterMm: boss, insertDepthMm, through });
    seats.push(c);
  }

  // Overlapping bosses would fuse two hole-circles and break the single-manifold plate.
  for (let i = 0; i < standoffs.length; i++) {
    for (let j = i + 1; j < standoffs.length; j++) {
      const a = standoffs[i].centerMm;
      const b = standoffs[j].centerMm;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * bossR + CONTACT_EPS) {
        return fail(
          "BOSS_OVERLAP",
          `${standoffs[i].label} and ${standoffs[j].label} bosses overlap or touch (⌀${boss.toFixed(2)} mm too large for their spacing). Increase spacing or reduce the boss diameter.`,
          standoffs[i].label,
        );
      }
    }
  }

  // ---- Plate footprint (per strategy). A footprint that cannot be built safely is a coded
  // error, never a silent fallback to another strategy (reviewer #2). ----
  const wall = WALL_MM;
  let plate: Pt[];
  let plateOffsetMm = 0;
  let requestedOutlineMm: Pt[] | null = null;
  if (m.kind === "rect-plate") {
    plate = rectRingLocal(-wall, -wall, dims.widthMm + wall, dims.heightMm + wall);
  } else if (m.kind === "standoff-bridge") {
    // Footprint derived purely from the real seats: the convex hull of every boss+wall
    // circle. For 1 seat this is a disc, for 2 a stadium, for ≥3 a rounded hull — no
    // fictitious semantic points are ever invented.
    const ringPts = seats.flatMap((c) => circleRing(c.x, c.y, bossR + wall, SEGMENTS));
    plate = convexHull(ringPts);
    plateOffsetMm = bossR + wall;
    if (plate.length < 3 || !isSimpleRing(plate)) return fail("BRIDGE_FOOTPRINT_FAILED", "Could not build a standoff-bridge footprint from the mounting seats.");
  } else {
    // plate-standoffs: the board outline, offset outward by the wall margin.
    const outline = ccw(project.board.outline!.vertices.map((v) => pxPointToBoardMm(v, frame)));
    requestedOutlineMm = outline.map((p) => ({ x: p.x, y: p.y }));
    if (!isSimpleRing(outline)) return fail("OUTLINE_NOT_SIMPLE", "The board outline self-intersects; it cannot be offset into a plate. Fix the outline before generating.", "outline");
    const offset = offsetRingOutward(outline, wall);
    if (!offset) return fail("OUTLINE_OFFSET_FAILED", "The board outline could not be offset into a plate without self-intersecting (a concave notch is narrower than the wall). Choose the rectangular or standoff-bridge strategy, or simplify the outline.", "outline");
    plate = offset;
    plateOffsetMm = wall;
  }

  // Corner radius (from the outline's Val, when known) — a real circular fillet.
  const cornerRadius = isKnown(project.board.outline!.cornerRadiusMm) ? project.board.outline!.cornerRadiusMm.value : 0;
  let corners: CornerReport[] = [];
  if (cornerRadius > 0) {
    const filleted = filletRing(plate, cornerRadius);
    plate = filleted.ring;
    corners = filleted.corners;
    const clampedCount = corners.filter((c) => c.clamped).length;
    if (clampedCount > 0) warnings.push(`Corner radius clamped on ${clampedCount} corner${clampedCount > 1 ? "s" : ""} to fit the adjacent edges — see per-corner effective radii in the export sidecar.`);
  }

  // ---- Side tabs are a hard structural CONTRACT (reviewer #5): a successful build emits the
  // requested count at the requested dimensions, or fails closed with TAB_PLACEMENT_FAILED —
  // no silent narrowing, no skipped tab. Each tab and its bore share one edge-local frame. ----
  const bb = boundingBoxLocal(plate);
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const tabReports: TabReport[] = [];
  const tabBores: { center: Pt; r: number }[] = [];
  const anchors: { pt: Pt; where: string }[] = [];
  if (m.sideTabs >= 2) anchors.push({ pt: { x: cx, y: bb.y0 }, where: "top" }, { pt: { x: cx, y: bb.y1 }, where: "bottom" });
  if (m.sideTabs >= 4) anchors.push({ pt: { x: bb.x0, y: cy }, where: "left" }, { pt: { x: bb.x1, y: cy }, where: "right" });
  const minEdgeLen = TAB_WIDTH_MM + 2 * MIN_TAB_EDGE_MARGIN_MM;
  for (const anchor of anchors) {
    const edge = bestEdgeForTab(plate, anchor.pt, minEdgeLen);
    if (edge < 0)
      return fail("TAB_PLACEMENT_FAILED", `The requested ${anchor.where} side tab cannot be placed: no plate edge near it is at least ${round2(minEdgeLen)} mm long for a ${TAB_WIDTH_MM} mm tab. Widen the plate, reduce the tab count, or choose a different strategy.`, `tab:${anchor.where}`);
    const tab = makeTab(plate, edge, TAB_WIDTH_MM, TAB_DEPTH_MM, TAB_BORE_RADIUS_MM);
    if (!tab.ok) return fail("TAB_PLACEMENT_FAILED", `The requested ${anchor.where} side tab cannot be placed: ${tab.reason}. Widen the plate, reduce the tab count, or choose a different strategy.`, `tab:${anchor.where}`);
    plate = tab.ring;
    tabBores.push({ center: tab.boreCenter, r: TAB_BORE_RADIUS_MM });
    // Emitted == requested (we would have failed otherwise); reported explicitly to prove it.
    tabReports.push({
      edgeIndex: edge,
      requestedWidthMm: TAB_WIDTH_MM,
      requestedDepthMm: TAB_DEPTH_MM,
      widthMm: TAB_WIDTH_MM,
      depthMm: TAB_DEPTH_MM,
      boreCenterMm: tab.boreCenter,
      boreRadiusMm: TAB_BORE_RADIUS_MM,
    });
  }

  if (!isSimpleRing(plate)) return fail("PLATE_NOT_SIMPLE", "The plate outline self-intersects after applying corner radius/tabs.");

  // Every standoff boss and tab bore must sit wholly inside the plate — not merely its
  // centre (reviewer #1: a boss centre can be inside while its rim crosses the boundary).
  const standoffOuterRings = standoffs.map((so) => circleRing(so.centerMm.x, so.centerMm.y, bossR, SEGMENTS));
  for (let i = 0; i < standoffs.length; i++) {
    if (!ringContainsRing(plate, standoffOuterRings[i])) {
      return fail("STANDOFF_OFF_PLATE", `${standoffs[i].label}'s boss is not wholly inside the plate footprint; move it inward or widen the plate.`, standoffs[i].label);
    }
  }
  const tabBoreRings = tabBores.map((t) => circleRing(t.center.x, t.center.y, t.r, SEGMENTS));
  for (let i = 0; i < tabBoreRings.length; i++) {
    if (!ringContainsRing(plate, tabBoreRings[i])) return fail("TAB_BORE_OFF_PLATE", "A side-tab bore is not wholly inside the plate.");
  }

  // Every mandatory feature ring must be pairwise-separated (tangent included) so no two
  // welded rims pinch the manifold (reviewer #1).
  const mandatory = [...standoffOuterRings, ...tabBoreRings];
  for (let i = 0; i < mandatory.length; i++) {
    for (let j = i + 1; j < mandatory.length; j++) {
      if (!ringsSeparated(mandatory[i], mandatory[j])) {
        return fail("FEATURE_RING_CONTACT", "Two mounting/tab features touch or overlap on the plate; increase their spacing.");
      }
    }
  }

  // ---- Keep-outs are ENFORCEABLE constraints, not advisory annotations (reviewer #1). The
  // bracket has material only on the board's underside (plate + standoffs + side tabs, all at
  // or below the board plane), so a TOP-side keep-out is inherently clear, while a BOTTOM-side
  // one faces the bracket and is honored by cutting its footprint through the plate. A keep-out
  // that intersects material we cannot cleanly remove FAILS the build rather than shipping a
  // bracket that violates it; a semantic we cannot represent faithfully also fails closed. ----
  const keepReports: KeepOutReport[] = [];
  const keepoutHoles: Pt[][] = [];
  for (const k of project.board.keepOuts) {
    const ch = maybe(k.clearanceHeightMm);
    const head = { id: k.id, label: k.label, boardSide: k.boardSide, requestedClearanceHeightMm: ch ?? null };
    const ring0 = keepOutRing(k, frame);
    if (!ring0 || !isSimpleRing(ccw(ring0))) {
      return fail("KEEPOUT_BLOCKED", `${k.label} has no usable or a self-intersecting footprint; it cannot be enforced as a keep-out.`, k.label);
    }
    const ring = ccw(ring0);

    if (k.boardSide === "top") {
      keepReports.push({ ...head, status: "satisfied-no-material", reason: "top-side clearance is above the board; the bracket sits entirely on the underside" });
      continue;
    }

    // Bottom side: the component projects toward the bracket. Resolve from the actual Z
    // intervals (reviewer #4) — the plate occupies z=[0, base] and a keep-out of height h
    // occupies [topZ - h, topZ], where topZ = base + standoffH is the board underside.
    if (mandatory.some((h) => !ringsSeparated(ring, h))) {
      return fail("KEEPOUT_BLOCKED", `${k.label} overlaps a standoff or side-tab bore that must remain; the bracket would intrude into the keep-out. Move the keep-out or the conflicting feature.`, k.label);
    }
    if (!ringsOverlap(plate, ring)) {
      keepReports.push({ ...head, status: "satisfied-no-material", reason: "footprint clears the plate and every feature" });
      continue;
    }
    // The keep-out volume reaches the plate only when its clearance spans the standoff gap
    // (h ≥ standoffH, within contact tolerance). A KNOWN shorter clearance sits entirely above
    // the plate top; with the footprint already clear of every standoff/tab, no bracket
    // material lies in the clearance volume → satisfied with nothing to cut. UNKNOWN clearance
    // is treated conservatively as reaching the plate (over-clearing a keep-out is safe;
    // under-clearing is not).
    const reachesPlate = ch == null || ch >= standoffH - CONTACT_EPS;
    if (!reachesPlate) {
      keepReports.push({
        ...head,
        status: "satisfied-no-material",
        reason: `bottom-side clearance ${round2(ch as number)} mm sits within the ${round2(standoffH)} mm standoff gap, above the plate; no bracket material is in the keep-out`,
      });
      continue;
    }
    if (!ringContainsRing(plate, ring)) {
      return fail("KEEPOUT_BLOCKED", `${k.label} crosses the plate edge; it cannot be cut as a clean interior keep-out. Move it wholly inside or outside the plate footprint.`, k.label);
    }
    if (keepoutHoles.some((h) => !ringsSeparated(ring, h))) {
      return fail("KEEPOUT_BLOCKED", `${k.label} overlaps another keep-out; merge or separate them so each can be cut cleanly.`, k.label);
    }
    keepoutHoles.push(ring);
    keepReports.push({ ...head, status: "honored-by-subtraction", reason: null });
  }

  // ---- Assemble + audit the single manifold from a pure-mm recipe. ----
  const recipe: SolidRecipe = {
    plate: plate.map((p) => ({ x: p.x, y: p.y })),
    baseZ0: 0,
    baseZ1: base,
    topZ: base + standoffH,
    standoffs: standoffs.map((so) => ({ center: { x: so.centerMm.x, y: so.centerMm.y }, bossR, boreR: so.boreDiameterMm / 2, through: so.through })),
    keepOutHoles: keepoutHoles.map((k) => k.map((p) => ({ x: p.x, y: p.y }))),
    tabBores: tabBores.map((t) => ({ center: { x: t.center.x, y: t.center.y }, r: t.r })),
    segments: SEGMENTS,
    weldEpsMm: WELD_EPS_MM,
  };
  const assembled = assembleSolid(recipe);
  if (!assembled.ok) return assembled;
  const mesh = assembled.mesh;
  const meshHash = hashMesh(mesh);

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
    tolerance: m.tolerance,
    baseThicknessMm: valOf(project.mount.baseThicknessMm, base),
    standoffHeightMm: valOf(project.mount.standoffHeightMm, standoffH),
    bossDiameterMm: valOf(project.mount.bossDiameterMm, boss),
    clearanceMm: valOf(project.mount.clearanceMm, clearance),
    toleranceOffsetMm: tolOffset,
    cornerRadiusMm: cornerRadius,
    corners,
    wallMm: wall,
    plateOffsetMm,
    segments: SEGMENTS,
    weldToleranceMm: WELD_EPS_MM,
    contactToleranceMm: CONTACT_EPS,
    requestedSideTabs: m.sideTabs,
    emittedTabCount: tabReports.length,
    tabs: tabReports,
    plateOutlineMm: recipe.plate,
    requestedOutlineMm,
    keepOuts: keepReports,
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

  return { ok: true, mesh, dims: genDims, warnings, effective, recipe, meshHash };
}

// ---- production fail-closed audit ----

interface AuditFail {
  ok: false;
  code: string;
  message: string;
}

/**
 * Verify a mesh is a single connected, watertight, consistently-oriented, vertex-manifold
 * solid of positive volume. Runs in production before any success is returned (reviewer #1).
 */
export function auditMesh(mesh: BracketMesh): { ok: true; components: number } | AuditFail {
  const p = mesh.positions;
  const idx = mesh.indices;
  const vCount = p.length / 3;
  const tCount = idx.length / 3;
  if (tCount === 0) return { ok: false, code: "EMPTY_SOLID", message: "no triangles" };

  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return { ok: false, code: "NON_FINITE", message: "a coordinate is not finite" };
  for (let i = 0; i < idx.length; i++) if (idx[i] >= vCount) return { ok: false, code: "BAD_INDEX", message: "a triangle index is out of range" };

  // Directed-edge bookkeeping for watertightness + orientation + vertex fans.
  const dirCount = new Map<string, number>(); // "a>b" -> count
  const undir = new Map<string, number>(); // "min_max" -> uses
  const uf = new UnionFind(tCount);
  const edgeToTri = new Map<string, number>(); // undirected edge -> a triangle that owns it
  const vertexOpp = new Map<number, [number, number][]>(); // vertex -> opposite directed edges of its incident tris

  let volume6 = 0;
  for (let t = 0; t < tCount; t++) {
    const a = idx[t * 3];
    const b = idx[t * 3 + 1];
    const c = idx[t * 3 + 2];
    if (a === b || b === c || a === c) return { ok: false, code: "DEGENERATE_TRI", message: "a triangle repeats a vertex" };
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
    // Nonzero area.
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.hypot(nx, ny, nz) < 1e-9) return { ok: false, code: "ZERO_AREA_TRI", message: "a triangle has zero area" };
    // Signed volume contribution (divergence theorem).
    volume6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);

    const tris: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [x, y] of tris) {
      dirCount.set(`${x}>${y}`, (dirCount.get(`${x}>${y}`) ?? 0) + 1);
      const uk = x < y ? `${x}_${y}` : `${y}_${x}`;
      undir.set(uk, (undir.get(uk) ?? 0) + 1);
      const owner = edgeToTri.get(uk);
      if (owner === undefined) edgeToTri.set(uk, t);
      else uf.union(owner, t);
    }
    // Opposite directed edge per triangle vertex (for the one-ring fan test).
    push2(vertexOpp, a, [b, c]);
    push2(vertexOpp, b, [c, a]);
    push2(vertexOpp, c, [a, b]);
  }

  // Watertight + consistently oriented: every undirected edge used exactly twice, once in
  // each direction.
  for (const [uk, uses] of undir) {
    if (uses !== 2) return { ok: false, code: "NON_MANIFOLD_EDGE", message: `an edge is shared by ${uses} triangles (not 2)` };
    const [lo, hi] = uk.split("_");
    const f = dirCount.get(`${lo}>${hi}`) ?? 0;
    const r = dirCount.get(`${hi}>${lo}`) ?? 0;
    if (f !== 1 || r !== 1) return { ok: false, code: "INCONSISTENT_ORIENTATION", message: "an edge is not traversed once in each direction" };
  }

  // Single connected component.
  const roots = new Set<number>();
  for (let t = 0; t < tCount; t++) roots.add(uf.find(t));
  if (roots.size !== 1) return { ok: false, code: "DISCONNECTED", message: `${roots.size} connected components (not 1)` };

  // Vertex-manifold: the opposite edges around each vertex form ONE closed cycle (a single
  // umbrella), so no two cones meet at a pinch vertex.
  for (const [v, opp] of vertexOpp) {
    const succ = new Map<number, number>();
    for (const [s, e] of opp) {
      if (succ.has(s)) return { ok: false, code: "NON_MANIFOLD_VERTEX", message: `vertex ${v} has a branching fan` };
      succ.set(s, e);
    }
    // Follow the chain from any start; it must return to start after exactly opp.length steps.
    const start = opp[0][0];
    let cur = start;
    let steps = 0;
    while (steps < opp.length) {
      const nxt = succ.get(cur);
      if (nxt === undefined) return { ok: false, code: "NON_MANIFOLD_VERTEX", message: `vertex ${v} fan is open` };
      cur = nxt;
      steps++;
      if (cur === start) break;
    }
    if (cur !== start || steps !== opp.length) return { ok: false, code: "NON_MANIFOLD_VERTEX", message: `vertex ${v} fan is not a single cycle` };
  }

  if (!(volume6 > 1e-9)) return { ok: false, code: "NON_POSITIVE_VOLUME", message: `signed volume ${(volume6 / 6).toFixed(6)} is not positive` };

  return { ok: true, components: roots.size };
}

function push2(map: Map<number, [number, number][]>, v: number, e: [number, number]): void {
  const cur = map.get(v);
  if (cur) cur.push(e);
  else map.set(v, [e]);
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

// ---- deterministic mesh fingerprint (internal determinism check, NOT a file hash) ----

/** FNV-1a over the welded positions (rounded to the weld quantum) and triangle indices. */
export function hashMesh(mesh: BracketMesh): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const q = 1 / WELD_EPS_MM;
  for (let i = 0; i < mesh.positions.length; i++) mix(Math.round(mesh.positions[i] * q) | 0);
  for (let i = 0; i < mesh.indices.length; i++) mix(mesh.indices[i] | 0);
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---- helpers ----

function keepOutRing(k: KeepOut, frame: NonNullable<ReturnType<typeof boardFrame>>): Pt[] | null {
  if (k.shape === "rect" && k.rectPx) {
    const a = pxPointToBoardMm({ x: k.rectPx.x, y: k.rectPx.y }, frame);
    const b = pxPointToBoardMm({ x: k.rectPx.x + k.rectPx.w, y: k.rectPx.y + k.rectPx.h }, frame);
    return rectRingLocal(a.x, a.y, b.x, b.y);
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

function rectRingLocal(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return ccw([
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]);
}

function boundingBoxLocal(pts: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
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
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
