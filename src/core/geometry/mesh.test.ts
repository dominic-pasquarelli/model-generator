import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { unknownVal } from "@/core/project/value";
import { buildBracketMesh, type BodyMesh } from "./mesh";

/**
 * A body is a valid closed, consistently-oriented manifold iff every directed edge
 * (a→b) occurs exactly once and its reverse (b→a) occurs exactly once. That single
 * property is watertightness + no boundary + consistent winding — the invariant a
 * STEP MANIFOLD_SOLID_BREP closed shell also requires.
 */
function edgeAudit(body: BodyMesh) {
  const directed = new Map<string, number>();
  const undirected = new Map<string, number>();
  const idx = body.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1);
      const u = a < b ? `${a}-${b}` : `${b}-${a}`;
      undirected.set(u, (undirected.get(u) ?? 0) + 1);
    }
  }
  const badDirected = [...directed.values()].filter((n) => n !== 1).length;
  const badUndirected = [...undirected.values()].filter((n) => n !== 2).length;
  const V = body.positions.length / 3;
  const F = idx.length / 3;
  const E = undirected.size;
  return { badDirected, badUndirected, euler: V - E + F };
}

describe("buildBracketMesh — real solid", () => {
  it("builds a closed manifold for every body of the sample bracket", () => {
    const r = buildBracketMesh(createSampleProject(1_000_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // plate + 4 standoffs + 2 side tabs.
    expect(r.mesh.bodies.map((b) => b.name)).toEqual([
      "plate",
      "standoff-1",
      "standoff-2",
      "standoff-3",
      "standoff-4",
      "tab-1",
      "tab-2",
    ]);
    for (const body of r.mesh.bodies) {
      const a = edgeAudit(body);
      expect(a.badDirected, `${body.name} has non-manifold directed edges`).toBe(0);
      expect(a.badUndirected, `${body.name} is not watertight`).toBe(0);
      expect(a.euler, `${body.name} is not genus-0 closed`).toBe(2);
    }
  });

  it("derives an honest bounding box (plate 85+2·3 wide, height base+standoff)", () => {
    const r = buildBracketMesh(createSampleProject(1_000_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dims.widthMm).toBe(91); // 85 + 2×3 wall
    expect(r.dims.heightMm).toBe(9); // base 3 + standoff 6
    expect(r.dims.standoffCount).toBe(4);
    expect(r.dims.bodies).toBe(7);
    expect(r.dims.triangles).toBeGreaterThan(0);
  });

  it("is deterministic — identical positions and indices for an unchanged model", () => {
    const a = buildBracketMesh(createSampleProject(1_000_000));
    const b = buildBracketMesh(createSampleProject(1_000_000));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(Array.from(a.mesh.positions)).toEqual(Array.from(b.mesh.positions));
    expect(Array.from(a.mesh.indices)).toEqual(Array.from(b.mesh.indices));
  });

  it("refuses geometry when an input is Unknown (never treats unknown as zero)", () => {
    const noDia = createSampleProject(1_000_000);
    noDia.board.holes[0].diameterMm = unknownVal<number>();
    const r1 = buildBracketMesh(noDia);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("MISSING_DIAMETER");

    const noHeight = createSampleProject(1_000_000);
    noHeight.mount.standoffHeightMm = unknownVal<number>();
    const r2 = buildBracketMesh(noHeight);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("MISSING_MOUNT_HEIGHT");

    const noCal = createSampleProject(1_000_000);
    noCal.calibration = null;
    const r3 = buildBracketMesh(noCal);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("UNRESOLVED_MODEL");
  });

  it("adds two more bodies for four side tabs", () => {
    const p = createSampleProject(1_000_000);
    p.mount.sideTabs = 4;
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dims.bodies).toBe(9); // plate + 4 standoffs + 4 tabs
  });
});
