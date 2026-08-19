import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { buildBracketMesh } from "@/core/geometry/mesh";
import { projectMesh, VIEW_PRESETS } from "./mesh3d";

function mesh() {
  const r = buildBracketMesh(createSampleProject(1_000_000));
  if (!r.ok) throw new Error("mesh build failed");
  return r.mesh;
}

describe("projectMesh", () => {
  it("culls backfaces and produces fewer polygons than triangles", () => {
    const m = mesh();
    const proj = projectMesh(m, VIEW_PRESETS.iso, { width: 400, height: 300 });
    expect(proj.faces.length).toBeGreaterThan(0);
    expect(proj.faces.length).toBeLessThan(m.triangleCount);
    expect(proj.viewBox).toBe("0 0 400 300");
  });

  it("keeps projected points inside the viewport with padding", () => {
    const proj = projectMesh(mesh(), VIEW_PRESETS.iso, { width: 400, height: 300, padding: 20 });
    for (const f of proj.faces) {
      for (const pair of f.points.split(" ")) {
        const [x, y] = pair.split(",").map(Number);
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(400.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeLessThanOrEqual(300.01);
      }
    }
  });

  it("is deterministic for the same camera and mesh", () => {
    const a = projectMesh(mesh(), VIEW_PRESETS.fit, { width: 500, height: 400 });
    const b = projectMesh(mesh(), VIEW_PRESETS.fit, { width: 500, height: 400 });
    expect(a.faces).toEqual(b.faces);
  });
});
