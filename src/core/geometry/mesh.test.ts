import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { measured, unknownVal } from "@/core/project/value";
import type { Project } from "@/core/project/types";
import { assembleSolid, auditMesh, buildBracketMesh, hashMesh, type BracketMesh } from "./mesh";

/**
 * Aggregate manifold audit over the WHOLE solid (not per-body):
 * - every undirected edge shared by exactly two triangles (watertight, no non-manifold);
 * - every directed edge used exactly once (consistent orientation, no coincident faces);
 * - exactly one connected component (one printable part).
 */
function audit(mesh: BracketMesh) {
  const idx = mesh.indices;
  const directed = new Map<string, number>();
  const undirected = new Map<string, number>();
  const parent: number[] = [];
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let v = 0; v < mesh.vertexCount; v++) parent[v] = v;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    union(tri[0], tri[1]);
    union(tri[1], tri[2]);
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1);
      const u = a < b ? `${a}-${b}` : `${b}-${a}`;
      undirected.set(u, (undirected.get(u) ?? 0) + 1);
    }
  }
  const usedVerts = new Set(idx);
  const roots = new Set<number>();
  for (const v of usedVerts) roots.add(find(v));
  return {
    boundaryEdges: [...undirected.values()].filter((n) => n !== 2).length,
    nonManifoldDirected: [...directed.values()].filter((n) => n !== 1).length,
    components: roots.size,
  };
}

function build(p: Project) {
  const r = buildBracketMesh(p);
  if (!r.ok) throw new Error(`build failed: ${r.error.code} ${r.error.message}`);
  return r;
}

describe("buildBracketMesh — one connected watertight manifold", () => {
  it("the whole sample bracket is a single closed manifold (one component, no boundary/non-manifold edges)", () => {
    const r = build(createSampleProject(1_000_000));
    expect(r.mesh.bodies.length).toBe(1); // one connected solid, not a pile of shells
    expect(r.dims.bodies).toBe(1);
    const a = audit(r.mesh);
    expect(a.boundaryEdges, "watertight").toBe(0);
    expect(a.nonManifoldDirected, "consistent orientation / no coincident faces").toBe(0);
    expect(a.components, "one connected part").toBe(1);
    // The SAME production audit that gates generation must pass (finite, indexed, nonzero
    // area, edge-manifold, one component, vertex-manifold fans, positive volume).
    const prod = auditMesh(r.mesh);
    expect(prod.ok, prod.ok ? "" : `${prod.code}: ${prod.message}`).toBe(true);
    if (prod.ok) expect(prod.components).toBe(1);
  });

  const variants: Array<[string, (p: Project) => void]> = [
    ["rect-plate strategy", (p) => (p.mount.kind = "rect-plate")],
    ["standoff-bridge strategy", (p) => (p.mount.kind = "standoff-bridge")],
    ["two side tabs", (p) => (p.mount.sideTabs = 2)],
    ["four side tabs", (p) => (p.mount.sideTabs = 4)],
    ["no side tabs", (p) => (p.mount.sideTabs = 0)],
    ["through-bolt fastener", (p) => (p.mount.fastenerStyle = "through-bolt")],
    ["self-tapping fastener", (p) => (p.mount.fastenerStyle = "self-tapping")],
    ["corner radius", (p) => (p.board.outline!.cornerRadiusMm = measured(3))],
  ];
  for (const [label, mutate] of variants) {
    it(`stays a single closed manifold with ${label}`, () => {
      const p = createSampleProject(1_000_000);
      mutate(p);
      const a = audit(build(p).mesh);
      expect(a.boundaryEdges, "watertight").toBe(0);
      expect(a.nonManifoldDirected, "orientation").toBe(0);
      expect(a.components, "one part").toBe(1);
    });
  }

  it("subtracts an interior keep-out and stays a single manifold (genus increases, still closed)", () => {
    const p = createSampleProject(1_000_000);
    // A small keep-out well inside the board footprint.
    p.board.keepOuts = [
      { id: "k", label: "K1", purpose: "clr", shape: "rect", boardSide: "top", rectPx: { x: 450, y: 300, w: 60, h: 60 }, clearanceHeightMm: measured(5), state: "measured" },
    ];
    const a = audit(build(p).mesh);
    expect(a.boundaryEdges).toBe(0);
    expect(a.nonManifoldDirected).toBe(0);
    expect(a.components).toBe(1);
  });

  it("rejects a hole placed off the plate footprint", () => {
    const p = createSampleProject(1_000_000);
    p.board.holes[0].centerPx = { x: -500, y: -500 }; // far outside the board/plate
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("STANDOFF_OFF_PLATE");
  });

  it("rejects overlapping bosses rather than fusing two holes", () => {
    const p = createSampleProject(1_000_000);
    p.board.holes = [p.board.holes[0], { ...p.board.holes[1], centerPx: { x: p.board.holes[0].centerPx.x + 5, y: p.board.holes[0].centerPx.y } }];
    const r = buildBracketMesh(p); // boss ⌀7 mm, centers 5 px = 0.5 mm apart → overlap
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BOSS_OVERLAP");
  });

  it("rejects a bore that would breach the boss wall (no silent resize)", () => {
    const p = createSampleProject(1_000_000);
    p.mount.bossDiameterMm = measured(3.4); // barely larger than the M3 bore → wall < 0.6 mm
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BORE_ESCAPES_STANDOFF");
  });

  it("blocks generation on unknown fabrication dimensions (never silently zero)", () => {
    for (const [field, code] of [
      ["bossDiameterMm", "MISSING_BOSS"],
      ["clearanceMm", "MISSING_CLEARANCE"],
      ["standoffHeightMm", "MISSING_MOUNT_HEIGHT"],
    ] as const) {
      const p = createSampleProject(1_000_000);
      p.mount[field] = unknownVal<number>();
      const r = buildBracketMesh(p);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(code);
    }
  });

  it("reports effective params with provenance and flags inferred fabrication dims", () => {
    const r = build(createSampleProject(1_000_000));
    expect(r.effective.standoffs.length).toBe(4);
    expect(r.effective.bossDiameterMm.value).toBe(7);
    // The sample's mount defaults are inferred → a warning lists them.
    expect(r.warnings.some((w) => /inferred fabrication/i.test(w))).toBe(true);
  });

  it("changing fastener style changes the bore (each option affects geometry)", () => {
    const blind = build(createSampleProject(1_000_000)).effective.standoffs[0].boreDiameterMm;
    const pilot = createSampleProject(1_000_000);
    pilot.mount.fastenerStyle = "self-tapping";
    expect(build(pilot).effective.standoffs[0].boreDiameterMm).not.toBeCloseTo(blind, 3);
  });

  it("is deterministic", () => {
    const a = build(createSampleProject(1_000_000));
    const b = build(createSampleProject(1_000_000));
    expect(Array.from(a.mesh.positions)).toEqual(Array.from(b.mesh.positions));
    expect(Array.from(a.mesh.indices)).toEqual(Array.from(b.mesh.indices));
    expect(a.meshHash).toBe(b.meshHash);
  });

  // ---- reviewer #6: custom tolerance value, standoff ids, requested-vs-emitted tabs ----

  it("fails closed when the custom tolerance profile is selected but has no value", () => {
    const p = createSampleProject(1_000_000);
    p.mount.tolerance = "custom";
    p.mount.customToleranceMm = null;
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MISSING_TOLERANCE");
  });

  it("uses the explicit custom offset when one is set (no hidden zero)", () => {
    const p = createSampleProject(1_000_000);
    p.mount.tolerance = "custom";
    p.mount.customToleranceMm = 0.4;
    const r = build(p);
    expect(r.effective.toleranceOffsetMm).toBe(0.4);
    // A different custom offset yields a different bore — the value genuinely drives geometry.
    const q = createSampleProject(1_000_000);
    q.mount.tolerance = "custom";
    q.mount.customToleranceMm = 0.1;
    expect(build(q).effective.standoffs[0].boreDiameterMm).not.toBeCloseTo(r.effective.standoffs[0].boreDiameterMm, 4);
  });

  it("carries the stable hole id on each standoff (join by id, not label)", () => {
    const p = createSampleProject(1_000_000);
    const r = build(p);
    const holeIds = new Set(p.board.holes.map((h) => h.id));
    expect(r.effective.standoffs.map((s) => s.id).sort()).toEqual([...holeIds].sort());
  });

  it("reports requested vs emitted side tabs (emitted equals the tabs actually placed)", () => {
    const p = createSampleProject(1_000_000);
    p.mount.sideTabs = 4;
    const r = build(p);
    expect(r.effective.requestedSideTabs).toBe(4);
    expect(r.effective.emittedTabCount).toBe(r.effective.tabs.length);
    expect(r.effective.emittedTabCount).toBeLessThanOrEqual(r.effective.requestedSideTabs);
  });
});

describe("buildBracketMesh — fail-closed hardening (reviewer #1/#2)", () => {
  it("rejects a boss whose centre is inside the plate but whose rim crosses the edge", () => {
    const p = createSampleProject(1_000_000);
    // Board-mm (0, 25): centre is inside the plate (left edge at −3 mm), but the ⌀7 mm boss
    // rim reaches −3.5 mm, past the plate edge. Centre-only checks would miss this.
    p.board.holes[0].centerPx = { x: 75, y: 300 };
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("STANDOFF_OFF_PLATE");
  });

  it("rejects two bosses that merely touch (tangent), not only ones that overlap", () => {
    const p = createSampleProject(1_000_000);
    // Centres exactly 2·bossR (7 mm = 70 px) apart → tangent → rejected within CONTACT_EPS.
    p.board.holes = [
      { ...p.board.holes[0], centerPx: { x: 200, y: 300 } },
      { ...p.board.holes[1], centerPx: { x: 270, y: 300 } },
    ];
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BOSS_OVERLAP");
  });

  it("returns a coded error when a concave outline cannot be offset (no silent strategy swap)", () => {
    const p = createSampleProject(1_000_000);
    p.mount.kind = "plate-standoffs";
    p.board.outline!.cornerRadiusMm = unknownVal<number>();
    // A rectangle with a 2 mm-wide slot cut 25 mm into the top edge; a 3 mm outward offset
    // folds the slot walls over each other.
    p.board.outline!.vertices = [
      { x: 75, y: 50 },
      { x: 490, y: 50 },
      { x: 490, y: 300 },
      { x: 510, y: 300 },
      { x: 510, y: 50 },
      { x: 925, y: 50 },
      { x: 925, y: 610 },
      { x: 75, y: 610 },
    ];
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["OUTLINE_OFFSET_FAILED", "OUTLINE_NOT_SIMPLE"]).toContain(r.error.code);
  });

  it("standoff-bridge builds a real footprint from few seats (1 and 2) and stays manifold", () => {
    for (const n of [1, 2]) {
      const p = createSampleProject(1_000_000);
      p.mount.kind = "standoff-bridge";
      p.board.holes = p.board.holes.slice(0, n);
      const r = build(p);
      const prod = auditMesh(r.mesh);
      expect(prod.ok, prod.ok ? "" : `${n} seats: ${prod.code}`).toBe(true);
    }
  });

  it("reports per-corner effective fillet radius (never the requested value when clamped)", () => {
    const p = createSampleProject(1_000_000);
    p.board.outline!.cornerRadiusMm = measured(3);
    const r = build(p);
    expect(r.effective.cornerRadiusMm).toBe(3);
    expect(r.effective.corners.length).toBeGreaterThan(0);
    for (const c of r.effective.corners) expect(c.effectiveRadiusMm).toBeLessThanOrEqual(3 + 1e-6);
  });

  it("assembleSolid reconstructs the same mesh hash from the pure-mm recipe", () => {
    const r = build(createSampleProject(1_000_000));
    const again = assembleSolid(r.recipe);
    expect(again.ok).toBe(true);
    if (again.ok) expect(hashMesh(again.mesh)).toBe(r.meshHash);
  });
});
