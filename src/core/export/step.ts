/**
 * STEP writer — real faceted B-rep (ISO-10303-21, AP214).
 *
 * Emits one MANIFOLD_SOLID_BREP per {@link BodyMesh}: a CLOSED_SHELL of triangular
 * ADVANCED_FACEs over planar surfaces, with welded VERTEX_POINTs and EDGE_CURVEs shared
 * between the two faces that meet at each edge (referenced with opposite ORIENTED_EDGE
 * sense). Because every body is watertight and consistently wound (see mesh.ts), the
 * shells are genuinely closed and manifold.
 *
 * Honesty boundary: this is a FACETED B-rep. Curved standoff walls and bores are the
 * mesh's flat facets, not analytic cylinders. The file is a structurally valid AP214
 * solid (verified host-level); import into Autodesk Fusion remains the unproven evidence
 * gate owned by ADR 0006 — this writer does not claim it.
 */
import type { BracketMesh, BodyMesh } from "@/core/geometry/mesh";

export interface StepMeta {
  productName: string;
  author: string;
  organization: string;
  createdIso: string;
  originatingSystem: string;
}

/** Format a real with a mandatory decimal point, normalising -0 and trimming noise. */
function r(v: number): string {
  // Snap -0 and sub-nanometre numerical noise (e.g. cos(π/2) ≈ 6e-17 at a ring seam)
  // to exact 0, so no meaningless near-zero exponent tokens are ever emitted.
  let x = Object.is(v, -0) ? 0 : v;
  if (Math.abs(x) < 1e-9) x = 0;
  if (Number.isInteger(x)) return `${x}.`;
  let s = x.toPrecision(9);
  // ISO-10303-21 REALs require an UPPERCASE exponent; JS toPrecision emits lowercase.
  if (s.includes("e") || s.includes("E")) return s.toUpperCase();
  s = s.replace(/(\.\d*?)0+$/, "$1");
  return s.includes(".") ? s : `${s}.`;
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  if (len === 0) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

class StepBuilder {
  private id = 0;
  private lines: string[] = [];

  put(body: string): number {
    const i = ++this.id;
    this.lines.push(`#${i}=${body};`);
    return i;
  }

  data(): string {
    return this.lines.join("\n");
  }
}

/** Emit one body's MANIFOLD_SOLID_BREP; returns its entity id. */
function emitBody(s: StepBuilder, body: BodyMesh, ctxId: number): number {
  const pos = body.positions;
  const idx = body.indices;
  const vertexCount = pos.length / 3;

  // One CARTESIAN_POINT + VERTEX_POINT per welded vertex (shared across faces/edges).
  const pointId: number[] = new Array(vertexCount);
  const vertexId: number[] = new Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const p = s.put(`CARTESIAN_POINT('',(${r(pos[v * 3])},${r(pos[v * 3 + 1])},${r(pos[v * 3 + 2])}))`);
    pointId[v] = p;
    vertexId[v] = s.put(`VERTEX_POINT('',#${p})`);
  }

  // One EDGE_CURVE per undirected edge, stored oriented low→high vertex index.
  interface Edge { id: number; a: number; b: number }
  const edges = new Map<string, Edge>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const getEdge = (a: number, b: number): Edge => {
    const key = edgeKey(a, b);
    const hit = edges.get(key);
    if (hit) return hit;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const dir = normalize(
      pos[hi * 3] - pos[lo * 3],
      pos[hi * 3 + 1] - pos[lo * 3 + 1],
      pos[hi * 3 + 2] - pos[lo * 3 + 2],
    );
    const dId = s.put(`DIRECTION('',(${r(dir[0])},${r(dir[1])},${r(dir[2])}))`);
    const vId = s.put(`VECTOR('',#${dId},1.)`);
    const lineId = s.put(`LINE('',#${pointId[lo]},#${vId})`);
    const ecId = s.put(`EDGE_CURVE('',#${vertexId[lo]},#${vertexId[hi]},#${lineId},.T.)`);
    const edge: Edge = { id: ecId, a: lo, b: hi };
    edges.set(key, edge);
    return edge;
  };

  const faceIds: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const t0 = idx[t];
    const t1 = idx[t + 1];
    const t2 = idx[t + 2];
    const tri: [number, number][] = [
      [t0, t1],
      [t1, t2],
      [t2, t0],
    ];
    const oriented: number[] = [];
    for (const [x, y] of tri) {
      const edge = getEdge(x, y);
      // ORIENTED_EDGE sense .T. when the face traverses the edge as stored (a→b).
      const sameSense = edge.a === x ? ".T." : ".F.";
      oriented.push(s.put(`ORIENTED_EDGE('',*,*,#${edge.id},${sameSense})`));
    }
    const loopId = s.put(`EDGE_LOOP('',(${oriented.map((o) => `#${o}`).join(",")}))`);
    const boundId = s.put(`FACE_OUTER_BOUND('',#${loopId},.T.)`);

    // PLANE at the triangle's first vertex, axis = outward face normal (right-hand rule
    // over the outward winding), ref direction = the first edge direction (in-plane).
    const ax = pos[t0 * 3];
    const ay = pos[t0 * 3 + 1];
    const az = pos[t0 * 3 + 2];
    const ux = pos[t1 * 3] - ax;
    const uy = pos[t1 * 3 + 1] - ay;
    const uz = pos[t1 * 3 + 2] - az;
    const vx = pos[t2 * 3] - ax;
    const vy = pos[t2 * 3 + 1] - ay;
    const vz = pos[t2 * 3 + 2] - az;
    const normal = normalize(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const refDir = normalize(ux, uy, uz);
    const locId = s.put(`CARTESIAN_POINT('',(${r(ax)},${r(ay)},${r(az)}))`);
    const axisId = s.put(`DIRECTION('',(${r(normal[0])},${r(normal[1])},${r(normal[2])}))`);
    const refId = s.put(`DIRECTION('',(${r(refDir[0])},${r(refDir[1])},${r(refDir[2])}))`);
    const placeId = s.put(`AXIS2_PLACEMENT_3D('',#${locId},#${axisId},#${refId})`);
    const planeId = s.put(`PLANE('',#${placeId})`);
    faceIds.push(s.put(`ADVANCED_FACE('',(#${boundId}),#${planeId},.T.)`));
  }

  const shellId = s.put(`CLOSED_SHELL('',(${faceIds.map((f) => `#${f}`).join(",")}))`);
  const safeName = body.name.replace(/[^A-Za-z0-9_-]+/g, "_");
  void ctxId;
  return s.put(`MANIFOLD_SOLID_BREP('${safeName}',#${shellId})`);
}

/** Serialise a full multi-body bracket mesh to an AP214 STEP part file. */
export function meshToStep(mesh: BracketMesh, meta: StepMeta): string {
  const s = new StepBuilder();

  // ---- Product / application structure ----
  const appCtx = s.put(`APPLICATION_CONTEXT('automotive design')`);
  s.put(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`);
  const prodCtx = s.put(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
  const safeProd = meta.productName.replace(/[^A-Za-z0-9_-]+/g, "_") || "board_mount";
  const product = s.put(`PRODUCT('${safeProd}','${safeProd}','',(#${prodCtx}))`);
  s.put(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${product}))`);
  const defCtx = s.put(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
  const formation = s.put(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
  const prodDef = s.put(`PRODUCT_DEFINITION('design','',#${formation},#${defCtx})`);
  const prodDefShape = s.put(`PRODUCT_DEFINITION_SHAPE('','',#${prodDef})`);

  // ---- Units + geometric representation context ----
  const lenUnit = s.put(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const angUnit = s.put(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const solidUnit = s.put(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const uncertainty = s.put(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${lenUnit},'distance_accuracy_value','confusion accuracy')`,
  );
  const ctx = s.put(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty}))` +
      `GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenUnit},#${angUnit},#${solidUnit}))REPRESENTATION_CONTEXT('Context #1','3D Context'))`,
  );

  // ---- Geometry: one solid per body ----
  const brepIds = mesh.bodies.map((body) => emitBody(s, body, ctx));

  const absr = s.put(`ADVANCED_BREP_SHAPE_REPRESENTATION('${safeProd}',(${brepIds.map((b) => `#${b}`).join(",")}),#${ctx})`);
  s.put(`SHAPE_DEFINITION_REPRESENTATION(#${prodDefShape},#${absr})`);

  const header = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('Board Mount Designer faceted B-rep solid','curved faces are facets, not analytic surfaces'),'2;1');`,
    `FILE_NAME('${safeProd}.step','${meta.createdIso}',('${escapeStr(meta.author)}'),('${escapeStr(meta.organization)}'),'${escapeStr(
      meta.originatingSystem,
    )}','Model Generator','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }'));",
    "ENDSEC;",
    "DATA;",
  ].join("\n");

  return `${header}\n${s.data()}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

function escapeStr(v: string): string {
  return v.replace(/'/g, "''").replace(/[\\]/g, "");
}
