import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { buildBracketMesh } from "@/core/geometry/mesh";
import { meshToStep, type StepMeta } from "./step";

const META: StepMeta = {
  productName: "cm4-mount",
  author: "Model Generator",
  organization: "local",
  createdIso: "2026-08-19T00:00:00.000Z",
  originatingSystem: "board-mount-designer",
};

function sampleStep() {
  const r = buildBracketMesh(createSampleProject(1_000_000));
  if (!r.ok) throw new Error("fixture mesh failed to build");
  return { step: meshToStep(r.mesh, META), mesh: r.mesh };
}

/** Parse `#N=BODY;` records out of the DATA section. */
function parseEntities(step: string): Map<number, string> {
  const map = new Map<number, string>();
  const re = /#(\d+)=((?:[^;']|'(?:[^']|'')*')*);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(step)) !== null) map.set(Number(m[1]), m[2]);
  return map;
}

describe("meshToStep — structural validity", () => {
  it("wraps a well-formed ISO-10303-21 AP214 envelope", () => {
    const { step } = sampleStep();
    expect(step.startsWith("ISO-10303-21;")).toBe(true);
    expect(step).toContain("HEADER;");
    expect(step).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }'));");
    expect(step).toContain("DATA;");
    expect(step.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
  });

  it("resolves every entity reference (no dangling #ids)", () => {
    const { step } = sampleStep();
    const entities = parseEntities(step);
    const dataStart = step.indexOf("DATA;");
    const data = step.slice(dataStart);
    const refs = data.match(/#(\d+)/g)!.map((r) => Number(r.slice(1)));
    const missing = refs.filter((r) => !entities.has(r));
    expect(missing).toEqual([]);
  });

  it("emits one closed-shell solid per body and one face per triangle", () => {
    const { step, mesh } = sampleStep();
    const breps = step.match(/MANIFOLD_SOLID_BREP/g)?.length ?? 0;
    const shells = step.match(/CLOSED_SHELL/g)?.length ?? 0;
    const faces = step.match(/ADVANCED_FACE/g)?.length ?? 0;
    expect(breps).toBe(mesh.bodies.length);
    expect(shells).toBe(mesh.bodies.length);
    expect(faces).toBe(mesh.triangleCount);
  });

  it("shares every edge between exactly two faces with opposite sense (closed manifold)", () => {
    const { step } = sampleStep();
    const byEdge = new Map<number, string[]>();
    const re = /ORIENTED_EDGE\('',\*,\*,#(\d+),(\.[TF]\.)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(step)) !== null) {
      const list = byEdge.get(Number(m[1])) ?? [];
      list.push(m[2]);
      byEdge.set(Number(m[1]), list);
    }
    expect(byEdge.size).toBeGreaterThan(0);
    for (const [edge, senses] of byEdge) {
      expect(senses.length, `edge #${edge} not shared by exactly two faces`).toBe(2);
      expect(new Set(senses), `edge #${edge} faces share the same sense`).toEqual(new Set([".T.", ".F."]));
    }
  });

  it("is deterministic for an unchanged mesh", () => {
    expect(sampleStep().step).toBe(sampleStep().step);
  });

  it("emits no lowercase-e exponent tokens even when a hole sits at the board origin", () => {
    // Hole at the outline bbox min → board-mm (0,0); a 48-seg ring seam lands on cos(π/2),
    // which without the -0/near-zero snap would serialise as a lowercase-e exponent real.
    const p = createSampleProject(1_000_000);
    p.board.holes = [{ ...p.board.holes[0], centerPx: { x: 75, y: 50 } }];
    const r = buildBracketMesh(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const step = meshToStep(r.mesh, META);
    expect(/[0-9]e[+-]?[0-9]/.test(step), "lowercase-e exponent present").toBe(false);
    // still reference-complete
    const entities = parseEntities(step);
    const data = step.slice(step.indexOf("DATA;"));
    const refs = data.match(/#(\d+)/g)!.map((x) => Number(x.slice(1)));
    expect(refs.filter((x) => !entities.has(x))).toEqual([]);
  });
});
