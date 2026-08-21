import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { measured } from "@/core/project/value";
import { auditMesh, buildBracketMesh, WELD_EPS_MM, type BracketMesh } from "@/core/geometry/mesh";
import type { Project } from "@/core/project/types";
import { formatStlCoord, meshToAsciiStl } from "./stl";

function sampleMesh() {
  const r = buildBracketMesh(createSampleProject(1_000_000));
  if (!r.ok) throw new Error("fixture mesh failed to build");
  return r.mesh;
}

/**
 * Re-serialise a mesh at an arbitrary precision (mirrors meshToAsciiStl's vertex emission)
 * so a test can compare the round-trip-safe 9-digit writer against the old 6-digit one.
 */
function serializeAt(mesh: BracketMesh, sig: number): string {
  const p = mesh.positions;
  const idx = mesh.indices;
  const out: string[] = ["solid t"];
  for (let t = 0; t < idx.length; t += 3) {
    out.push("facet normal 0 0 1", "outer loop");
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k] * 3;
      out.push(`vertex ${formatStlCoord(p[a], sig)} ${formatStlCoord(p[a + 1], sig)} ${formatStlCoord(p[a + 2], sig)}`);
    }
    out.push("endloop", "endfacet");
  }
  out.push("endsolid t");
  return out.join("\n");
}

/**
 * Parse an ASCII STL back into a welded {@link BracketMesh} (weld quantum = WELD_EPS_MM),
 * KEEPING degenerate triangles so a downstream audit can catch any collapse. This is the
 * "artifact representation" the reviewer asks us to re-audit.
 */
function parseStlToMesh(stl: string): BracketMesh {
  const verts: number[] = [];
  const indices: number[] = [];
  const weldMap = new Map<string, number>();
  const q = 1 / WELD_EPS_MM;
  const key = (x: number, y: number, z: number) => `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
  const addVertex = (x: number, y: number, z: number) => {
    const k = key(x, y, z);
    const hit = weldMap.get(k);
    if (hit !== undefined) return hit;
    const i = verts.length / 3;
    verts.push(x, y, z);
    weldMap.set(k, i);
    return i;
  };
  const tri: number[] = [];
  for (const line of stl.split("\n")) {
    const m = line.trim().match(/^vertex\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (!m) continue;
    tri.push(addVertex(Number(m[1]), Number(m[2]), Number(m[3])));
    if (tri.length === 3) {
      indices.push(tri[0], tri[1], tri[2]);
      tri.length = 0;
    }
  }
  const positions = new Float32Array(verts);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < verts.length; i += 3)
    for (let a = 0; a < 3; a++) {
      if (verts[i + a] < min[a]) min[a] = verts[i + a];
      if (verts[i + a] > max[a]) max[a] = verts[i + a];
    }
  const idxArr = new Uint32Array(indices);
  return {
    bodies: [{ name: "t", positions, indices: idxArr }],
    positions,
    indices: idxArr,
    bbox: { min, max },
    triangleCount: idxArr.length / 3,
    vertexCount: positions.length / 3,
  };
}

/** A ~1012×667 mm board (within the MAX_DIMENSION_MM envelope) so features sit near 1000 mm. */
function largeBoardProject(microBore = false): Project {
  const p = createSampleProject(1_000_000);
  p.calibration!.pxPerMm = 0.84; // 850 px / 0.84 ≈ 1012 mm wide
  if (microBore) {
    p.mount.tolerance = "sla-0.05";
    p.mount.clearanceMm = measured(0);
    // A tiny bore override (~0.06 mm radius) whose tessellated ring near x≈1003 mm has sub-0.01
    // mm chords — exactly the sub-token-grid features that collapse under 6-sig-digit formatting.
    p.board.holes = [
      { ...p.board.holes[0], centerPx: { x: 918, y: 300 }, boreDiameterMm: measured(0.024) },
      { ...p.board.holes[1], centerPx: { x: 120, y: 300 } },
    ];
  }
  return p;
}

describe("meshToAsciiStl", () => {
  it("emits one facet per mesh triangle, wrapped in a named solid", () => {
    const mesh = sampleMesh();
    const stl = meshToAsciiStl(mesh, "cm4 mount");
    expect(stl.startsWith("solid cm4_mount")).toBe(true);
    expect(stl.trimEnd().endsWith("endsolid cm4_mount")).toBe(true);
    const facets = stl.match(/facet normal/g)?.length ?? 0;
    const vertices = stl.match(/^\s*vertex /gm)?.length ?? 0;
    expect(facets).toBe(mesh.triangleCount);
    expect(vertices).toBe(mesh.triangleCount * 3);
  });

  it("is deterministic for an unchanged mesh", () => {
    expect(meshToAsciiStl(sampleMesh())).toBe(meshToAsciiStl(sampleMesh()));
  });

  // ---- round-trip-safe precision (reviewer #5A) ----

  it("keeps sub-0.01 mm-distinct coordinates near 1000 mm distinct (9 digits), which 6 digits collapse", () => {
    expect(formatStlCoord(1000.0001, 9)).not.toBe(formatStlCoord(1000.0004, 9));
    expect(formatStlCoord(1000.0001, 6)).toBe(formatStlCoord(1000.0004, 6)); // the old writer's bug
  });

  it("the emitted STL re-welds and re-audits as a single manifold (sample + large board)", () => {
    for (const p of [createSampleProject(1_000_000), largeBoardProject()]) {
      const r = buildBracketMesh(p);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const artifact = parseStlToMesh(meshToAsciiStl(r.mesh));
      const audit = auditMesh(artifact);
      expect(audit.ok, audit.ok ? "" : `${audit.code}: ${audit.message}`).toBe(true);
    }
  });

  it("a small feature near 1000 mm survives the 9-digit artifact but collapses under 6 digits", () => {
    const r = buildBracketMesh(largeBoardProject(true));
    expect(r.ok, r.ok ? "" : (r as { error: { code: string } }).error.code).toBe(true);
    if (!r.ok) return;
    const nine = auditMesh(parseStlToMesh(serializeAt(r.mesh, 9)));
    const six = auditMesh(parseStlToMesh(serializeAt(r.mesh, 6)));
    expect(nine.ok, nine.ok ? "" : `9-digit: ${nine.code}`).toBe(true);
    expect(six.ok).toBe(false); // 6 digits collapse distinct ring vertices → degenerate/non-manifold
  });
});
