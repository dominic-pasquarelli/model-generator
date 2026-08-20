import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { measured, unknownVal } from "@/core/project/value";
import type { Project } from "@/core/project/types";
import { buildBracketMesh, type BracketMesh } from "./mesh";

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
  });
});
