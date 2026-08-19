/**
 * Real bracket geometry — the shared solid path.
 *
 * `buildBracketMesh` turns the canonical semantic model into an actual watertight,
 * manifold triangle solid in BOARD-SPACE MILLIMETRES: a base plate, one hollow
 * standoff per mounting hole (an outer boss with a coaxial insert/screw bore), and
 * optional side tabs. It is deterministic (fixed tessellation, no RNG, no time) and
 * dependency-free, so preview, STL, and STEP all derive from the same solid — the
 * "same shared geometry path" rule from AGENTS.md / the geometry & STEP export plans.
 *
 * The solid is a MULTI-BODY solid: the plate, each standoff, and each tab are separate
 * closed shells (bodies). Booleans are avoided entirely — every body is watertight by
 * construction — which is what makes an in-browser, kernel-free real solid tractable.
 * Curved faces (standoff walls, bores) are faceted at a fixed segment count; that facet
 * set is the honest limit of this generator and is what STEP faceted-B-rep records.
 */
import { boardFrame, outlineDims, pxPointToBoardMm } from "@/core/project/derive";
import type { GeneratedDimensions, Project } from "@/core/project/types";
import { maybe } from "@/core/project/value";
import type { GeometryError } from "./adapter";

export type Vec3 = readonly [number, number, number];

/** One closed, watertight body (welded vertices, outward-wound triangles). */
export interface BodyMesh {
  name: string;
  /** xyz triplets, board-space millimetres. */
  positions: Float32Array;
  /** Triangle vertex indices into `positions`. */
  indices: Uint32Array;
}

export interface BracketMesh {
  /** Per-body closed shells (for STEP one MANIFOLD_SOLID_BREP each). */
  bodies: BodyMesh[];
  /** All bodies concatenated (for preview + STL, where bodies may overlap freely). */
  positions: Float32Array;
  indices: Uint32Array;
  bbox: { min: Vec3; max: Vec3 };
  triangleCount: number;
  vertexCount: number;
}

export type MeshResult =
  | { ok: true; mesh: BracketMesh; dims: GeneratedDimensions }
  | { ok: false; error: GeometryError };

/** Circle facet count. One value for every consumer keeps preview/STL/STEP identical. */
export const SEGMENTS = 48;
/** Illustrative wall/margin (mm) around the board footprint — matches the shell's WALL_MM. */
export const WALL_MM = 3;
/** Minimum boss wall left around a bore before it is treated as escaping the standoff. */
const MIN_BOSS_WALL_MM = 0.6;
/**
 * Minimum bore radius (mm) that still tessellates to a non-degenerate ring. Below this,
 * adjacent bore-ring vertices fall within the 1e-4 mm vertex-weld tolerance and would
 * collapse the ring — so a sub-threshold bore is dropped (a solid standoff) rather than
 * silently opening the shell. Sub-50-micron screw holes are not physically meaningful.
 */
const MIN_BORE_RADIUS_MM = 0.05;

// ----------------------------------------------------------------------------
// Per-body mesh builder — welds coincident vertices so shared edges are shared,
// which a valid closed-shell STEP B-rep requires.
// ----------------------------------------------------------------------------

class BodyBuilder {
  private verts: number[] = [];
  private idx: number[] = [];
  private map = new Map<string, number>();

  constructor(readonly name: string) {}

  private key(x: number, y: number, z: number): string {
    // Round to 1e-4 mm to kill float noise so genuinely-coincident corners weld.
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

  /** Add a triangle by three points, wound so its normal faces `outward`. */
  triOut(a: Vec3, b: Vec3, c: Vec3, outward: Vec3): void {
    const ia = this.addVertex(a[0], a[1], a[2]);
    const ib = this.addVertex(b[0], b[1], b[2]);
    const ic = this.addVertex(c[0], c[1], c[2]);
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, outward) >= 0) this.idx.push(ia, ib, ic);
    else this.idx.push(ia, ic, ib);
  }

  /** Add a planar quad p0→p1→p2→p3, split into two triangles facing `outward`. */
  quadOut(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, outward: Vec3): void {
    this.triOut(p0, p1, p2, outward);
    this.triOut(p0, p2, p3, outward);
  }

  build(): BodyMesh {
    return {
      name: this.name,
      positions: new Float32Array(this.verts),
      indices: new Uint32Array(this.idx),
    };
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
// Primitives — each returns a self-contained watertight body.
// ----------------------------------------------------------------------------

/** Axis-aligned solid box [x0,x1]×[y0,y1]×[z0,z1]. */
function box(name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): BodyMesh {
  const b = new BodyBuilder(name);
  const v = (x: number, y: number, z: number): Vec3 => [x, y, z];
  // +X / -X
  b.quadOut(v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1), [1, 0, 0]);
  b.quadOut(v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1), [-1, 0, 0]);
  // +Y / -Y
  b.quadOut(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), [0, 1, 0]);
  b.quadOut(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), [0, -1, 0]);
  // +Z / -Z
  b.quadOut(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), [0, 0, 1]);
  b.quadOut(v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), [0, 0, -1]);
  return b.build();
}

/**
 * Vertical standoff at (cx,cy) from z0 to z1: an outer cylinder of radius `outer`, with
 * a coaxial blind bore of radius `bore` sunk from the top down to `boreFloorZ`. When the
 * bore is non-positive it degrades to a solid cylinder. Faceted at `seg` segments.
 */
function standoff(
  name: string,
  cx: number,
  cy: number,
  outer: number,
  bore: number,
  z0: number,
  z1: number,
  boreFloorZ: number,
  seg: number,
): BodyMesh {
  const b = new BodyBuilder(name);
  const ang = (i: number) => (2 * Math.PI * i) / seg;
  const ringPt = (r: number, i: number, z: number): Vec3 => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i)), z];
  const radialOut = (i: number): Vec3 => {
    const m = (ang(i) + ang(i + 1)) / 2;
    return [Math.cos(m), Math.sin(m), 0];
  };
  const hasBore = bore >= MIN_BORE_RADIUS_MM && bore < outer;

  for (let i = 0; i < seg; i++) {
    const ro = radialOut(i);
    // Outer wall (full height).
    b.quadOut(ringPt(outer, i, z0), ringPt(outer, i + 1, z0), ringPt(outer, i + 1, z1), ringPt(outer, i, z1), ro);
    // Bottom cap: always a solid disk — the bore is blind from the top and never
    // reaches the bottom, so no ring hole is opened here.
    b.triOut(ringPt(outer, i, z0), ringPt(outer, i + 1, z0), [cx, cy, z0], [0, 0, -1]);
    if (hasBore) {
      // Top face is an annulus (ring) between outer and bore radii.
      b.quadOut(ringPt(outer, i, z1), ringPt(outer, i + 1, z1), ringPt(bore, i + 1, z1), ringPt(bore, i, z1), [0, 0, 1]);
      // Bore wall (inward-facing) from the top rim down to the bore floor.
      const ri: Vec3 = [-Math.cos((ang(i) + ang(i + 1)) / 2), -Math.sin((ang(i) + ang(i + 1)) / 2), 0];
      b.quadOut(
        ringPt(bore, i, z1),
        ringPt(bore, i + 1, z1),
        ringPt(bore, i + 1, boreFloorZ),
        ringPt(bore, i, boreFloorZ),
        ri,
      );
      // Bore floor (a disk facing up, closing the blind hole).
      b.triOut(ringPt(bore, i, boreFloorZ), ringPt(bore, i + 1, boreFloorZ), [cx, cy, boreFloorZ], [0, 0, 1]);
    } else {
      // Solid top disk.
      b.triOut(ringPt(outer, i, z1), ringPt(outer, i + 1, z1), [cx, cy, z1], [0, 0, 1]);
    }
  }
  return b.build();
}

// ----------------------------------------------------------------------------
// Assembly.
// ----------------------------------------------------------------------------

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

function fail(code: string, message: string, feature?: string): { ok: false; error: GeometryError } {
  return { ok: false, error: feature ? { code, message, feature } : { code, message } };
}

/**
 * Build the real bracket solid from the canonical model. Returns diagnosable errors
 * (the same taxonomy the shell already surfaces) rather than inventing geometry when a
 * required input is Unknown — an unknown value is never treated as zero.
 */
export function buildBracketMesh(project: Project): MeshResult {
  const frame = boardFrame(project);
  if (!frame) {
    const feature = !project.calibration || project.calibration.status !== "valid" ? "calibration" : "outline";
    return fail("UNRESOLVED_MODEL", "A valid calibration and a board outline are required before a mount can be generated.", feature);
  }
  const dims = outlineDims(project);
  if (!dims || dims.widthMm <= 0 || dims.heightMm <= 0) {
    return fail("NO_DIMENSIONS", "Outline produced no measurable footprint.");
  }
  if (project.board.holes.length === 0) {
    return fail("NO_STANDOFFS", "At least one mounting hole is needed to place a standoff.", "holes");
  }
  const base = maybe(project.mount.baseThicknessMm);
  const standoffH = maybe(project.mount.standoffHeightMm);
  if (base == null || standoffH == null) {
    const feature = standoffH == null ? "standoff height" : "base thickness";
    return fail("MISSING_MOUNT_HEIGHT", `Mount ${feature} is not set; the bracket height cannot be derived.`, feature);
  }
  if (!(base > 0) || !(standoffH > 0)) {
    const feature = !(standoffH > 0) ? "standoff height" : "base thickness";
    return fail("INVALID_MOUNT_HEIGHT", `Mount ${feature} must be greater than zero.`, feature);
  }
  for (const h of project.board.holes) {
    const d = maybe(h.diameterMm);
    if (d == null) return fail("MISSING_DIAMETER", `${h.label} has no diameter; its standoff and screw hole cannot be sized.`, h.label);
    if (!(d > 0)) return fail("INVALID_DIAMETER", `${h.label} has a non-positive diameter.`, h.label);
  }

  const boss = maybe(project.mount.bossDiameterMm);
  const clearance = maybe(project.mount.clearanceMm) ?? 0;

  // Board footprint in board-mm, expanded by the wall margin → the plate rectangle.
  const plateX0 = -WALL_MM;
  const plateY0 = -WALL_MM;
  const plateX1 = dims.widthMm + WALL_MM;
  const plateY1 = dims.heightMm + WALL_MM;
  const baseZ0 = 0;
  const baseZ1 = base;
  const topZ = base + standoffH;

  const bodies: BodyMesh[] = [box("plate", plateX0, plateX1, plateY0, plateY1, baseZ0, baseZ1)];

  project.board.holes.forEach((h, i) => {
    const c = pxPointToBoardMm(h.centerPx, frame);
    const holeD = maybe(h.diameterMm)!;
    // Bore = entered clearance/drill diameter plus the fit clearance; boss = mount boss
    // diameter, or a sensible ring around the bore when the boss is Unknown.
    const boreR = (holeD + clearance) / 2;
    const outerR = boss != null && boss > 0 ? boss / 2 : boreR + 2;
    const safeOuterR = Math.max(outerR, boreR + MIN_BOSS_WALL_MM);
    // Blind bore floor sits at the plate top so screws/inserts land on solid plate.
    bodies.push(standoff(`standoff-${i + 1}`, c.x, c.y, safeOuterR, boreR, baseZ0, topZ, baseZ1, SEGMENTS));
  });

  // Side tabs: mounting ears centred on the long (X) edges, protruding in −Y / +Y.
  const tabCount = project.mount.sideTabs;
  if (tabCount >= 2) {
    const tabW = Math.min(14, (plateX1 - plateX0) * 0.28);
    const tabD = 8;
    const cxMid = (plateX0 + plateX1) / 2;
    // Two tabs (top & bottom edges); four adds left & right edges.
    bodies.push(box("tab-1", cxMid - tabW / 2, cxMid + tabW / 2, plateY0 - tabD, plateY0, baseZ0, baseZ1));
    bodies.push(box("tab-2", cxMid - tabW / 2, cxMid + tabW / 2, plateY1, plateY1 + tabD, baseZ0, baseZ1));
    if (tabCount >= 4) {
      const cyMid = (plateY0 + plateY1) / 2;
      const tabH = Math.min(14, (plateY1 - plateY0) * 0.28);
      bodies.push(box("tab-3", plateX0 - tabD, plateX0, cyMid - tabH / 2, cyMid + tabH / 2, baseZ0, baseZ1));
      bodies.push(box("tab-4", plateX1, plateX1 + tabD, cyMid - tabH / 2, cyMid + tabH / 2, baseZ0, baseZ1));
    }
  }

  const mesh = combine(bodies);
  const genDims: GeneratedDimensions = {
    widthMm: round2(mesh.bbox.max[0] - mesh.bbox.min[0]),
    depthMm: round2(mesh.bbox.max[1] - mesh.bbox.min[1]),
    heightMm: round2(mesh.bbox.max[2] - mesh.bbox.min[2]),
    standoffCount: project.board.holes.length,
    bodies: bodies.length,
    triangles: mesh.triangleCount,
  };
  return { ok: true, mesh, dims: genDims };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
