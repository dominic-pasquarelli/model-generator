import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { buildBracketMesh } from "@/core/geometry/mesh";
import { meshToAsciiStl } from "./stl";

function sampleMesh() {
  const r = buildBracketMesh(createSampleProject(1_000_000));
  if (!r.ok) throw new Error("fixture mesh failed to build");
  return r.mesh;
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
});
