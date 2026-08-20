import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { buildBracketMesh } from "@/core/geometry/mesh";
import { generationKey } from "@/core/project/derive";
import { solidGenerator } from "@/core/geometry/solidGenerator";
import type { Project } from "@/core/project/types";
import { meshToStep, type StepMeta } from "./step";
import { meshToAsciiStl } from "./stl";
import { buildExport } from "./exporter";

const STEP_META: StepMeta = {
  productName: "p",
  author: "a",
  organization: "o",
  createdIso: "2026-08-19T00:00:00.000Z",
  originatingSystem: "s",
};

async function withGeneration(p: Project): Promise<Project> {
  const r = await solidGenerator.generate(p);
  if (!r.ok) throw new Error(`generation failed: ${r.error.code}`);
  return { ...p, generated: r.model };
}

describe("export units are geometry-fixed, independent of display", () => {
  it("records geometryUnits: mm always, and displayUnits from the toggle", async () => {
    const built = buildExport(await withGeneration(createSampleProject(1_000_000)), {
      format: "step",
      writeSidecar: true,
      now: 1_000_000,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.artifact.metadata.geometryUnits).toBe("mm");
    expect(built.artifact.metadata.displayUnits).toBe("mm");
    expect(built.artifact.sidecar).toContain('"geometryUnits": "mm"');
  });

  it("switching display units to inch changes nothing about geometry, key, STL, or STEP", async () => {
    const base = createSampleProject(1_000_000);
    const inch: Project = { ...base, units: "inch" };

    const mMm = buildBracketMesh(base);
    const mIn = buildBracketMesh(inch);
    expect(mMm.ok && mIn.ok).toBe(true);
    if (!mMm.ok || !mIn.ok) return;
    expect(Array.from(mMm.mesh.positions)).toEqual(Array.from(mIn.mesh.positions));
    expect(generationKey(base)).toBe(generationKey(inch));
    expect(meshToStep(mMm.mesh, STEP_META)).toBe(meshToStep(mIn.mesh, STEP_META));
    expect(meshToAsciiStl(mMm.mesh)).toBe(meshToAsciiStl(mIn.mesh));

    const bMm = buildExport(await withGeneration(base), { format: "stl", writeSidecar: true, now: 1 });
    const bIn = buildExport(await withGeneration(inch), { format: "stl", writeSidecar: true, now: 1 });
    expect(bMm.ok && bIn.ok).toBe(true);
    if (!bMm.ok || !bIn.ok) return;
    expect(bMm.artifact.metadata.geometryUnits).toBe("mm");
    expect(bIn.artifact.metadata.geometryUnits).toBe("mm");
    expect(bMm.artifact.metadata.displayUnits).toBe("mm");
    expect(bIn.artifact.metadata.displayUnits).toBe("inch");
    expect(bMm.artifact.body).toBe(bIn.artifact.body); // identical STL bytes
  });
});
