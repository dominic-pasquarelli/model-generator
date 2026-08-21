import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { assembleSolid, buildBracketMesh, hashMesh } from "@/core/geometry/mesh";
import { generationKey } from "@/core/project/derive";
import { solidGenerator } from "@/core/geometry/solidGenerator";
import { defaultMount } from "@/core/project/schema";
import { sha256Text } from "@/lib/sha256";
import { measured } from "@/core/project/value";
import type { MountStrategy, Project } from "@/core/project/types";
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

describe("sidecar carries a full auditable parameter snapshot (reviewer #4)", () => {
  it("records effective dims with provenance, requested-vs-effective, and a per-standoff bore table", async () => {
    const project = await withGeneration(createSampleProject(1_000_000));
    const built = buildExport(project, { format: "step", writeSidecar: true, now: 1_000_000 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const params = built.artifact.metadata.parameters;
    expect(params).not.toBeNull();
    if (!params) return;

    // Strategy / tolerance and the generator constants are all present.
    expect(params.strategy).toBe(project.mount.kind);
    expect(params.tolerance).toBe(project.mount.tolerance);
    expect(params.wallMm).toBeGreaterThan(0);
    expect(params.minBossWallMm).toBeGreaterThan(0);

    // The sample's boss diameter is an INFERRED default — the snapshot says so, and shows
    // the requested input beside the effective value (requested-vs-effective is auditable).
    expect(params.bossDiameterMm.source).toBe("inferred");
    expect(params.bossDiameterMm.requested).toEqual({ known: true, valueMm: 7, source: "inferred" });
    expect(params.bossDiameterMm.effectiveMm).toBe(7);

    // Every hole yields one standoff carrying its per-hole fastener + install style + bore
    // provenance (reviewer #3) — the sample's holes are M3 heat-set with an inferred profile bore.
    expect(params.standoffs).toHaveLength(project.board.holes.length);
    for (const s of params.standoffs) {
      expect(s.boreDiameterMm).toBeGreaterThan(0);
      expect(typeof s.through).toBe("boolean");
      expect(s.fastener).toBe("M3");
      expect(s.fastenerStyle).toBe("heat-set-insert");
      expect(s.boreSource).toBe("inferred");
      expect(s.requestedBoreDiameterMm).toBeNull();
      expect(s.insertDepthMm).toBeGreaterThan(0); // heat-set carries a seat depth
      expect(Number.isFinite(s.centerMm.x) && Number.isFinite(s.centerMm.y)).toBe(true);
    }

    // The snapshot is serialised into the sidecar text, not just the in-memory object.
    expect(built.artifact.sidecar).toContain('"parameters"');
    expect(built.artifact.sidecar).toContain('"minBossWallMm"');
  });

  it("carries each keep-out's enforceable-constraint contract (id, side, clearance, status)", async () => {
    const project = await withGeneration(createSampleProject(1_000_000));
    const built = buildExport(project, { format: "step", writeSidecar: true, now: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const kos = built.artifact.metadata.parameters.keepOuts;
    expect(kos).toHaveLength(project.board.keepOuts.length);
    for (const k of kos) {
      expect(typeof k.id).toBe("string");
      expect(["top", "bottom"]).toContain(k.boardSide);
      expect(["honored-by-subtraction", "satisfied-no-material", "blocked", "unsupported-semantic"]).toContain(k.status);
    }
    // The sample's keep-outs are top-side, so each is satisfied with no material removed.
    expect(kos.every((k) => k.status === "satisfied-no-material")).toBe(true);
    // Ids join the sidecar back to the model's keep-outs.
    expect(kos.map((k) => k.id).sort()).toEqual(project.board.keepOuts.map((k) => k.id).sort());
    expect(built.artifact.sidecar).toContain('"status": "satisfied-no-material"');
  });
});

describe("artifact integrity hash (reviewer #5B)", () => {
  it("records the SHA-256 of the EXACT body in the metadata, sidecar, and export record", async () => {
    const project = await withGeneration(createSampleProject(1_000_000));
    const built = buildExport(project, { format: "stl", writeSidecar: true, now: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { body, metadata, record, sidecar } = built.artifact;

    // The hash is of the downloaded bytes, computed independently here.
    const expected = sha256Text(body);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.artifactSha256).toBe(expected);
    expect(record.artifactSha256).toBe(expected);
    expect(sidecar).toContain(`"artifactSha256": "${expected}"`);
  });

  it("is a real file hash distinct from the 32-bit internal mesh fingerprint", async () => {
    const project = await withGeneration(createSampleProject(1_000_000));
    const built = buildExport(project, { format: "step", writeSidecar: true, now: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.artifact.metadata.artifactSha256).not.toBe(built.artifact.metadata.meshHash);
    // A single altered byte in the body yields a different SHA-256 (tamper-evident).
    expect(sha256Text(built.artifact.body)).not.toBe(sha256Text(built.artifact.body + " "));
  });

  it("STL and STEP of the same solid hash differently (the hash is of the body, not the mesh)", async () => {
    const project = await withGeneration(createSampleProject(1_000_000));
    const stl = buildExport(project, { format: "stl", writeSidecar: false, now: 1 });
    const step = buildExport(project, { format: "step", writeSidecar: false, now: 1 });
    expect(stl.ok && step.ok).toBe(true);
    if (!stl.ok || !step.ok) return;
    expect(stl.artifact.metadata.artifactSha256).not.toBe(step.artifact.metadata.artifactSha256);
  });
});

describe("exact-build sidecar provenance + reconstruction (reviewer #3)", () => {
  it("reconstructs the identical solid from the sidecar's geometryRecipe (same mesh hash + dims)", async () => {
    const project = await withGeneration(createSampleProject(1_000_000));
    const built = buildExport(project, { format: "step", writeSidecar: true, now: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const meta = built.artifact.metadata;

    // Round-trip the sidecar through JSON, exactly as an auditor would read it back.
    const recipe = JSON.parse(built.artifact.sidecar!).geometryRecipe;
    const rebuilt = assembleSolid(recipe);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;
    expect(hashMesh(rebuilt.mesh)).toBe(meta.meshHash);
    const bbox = rebuilt.mesh.bbox;
    expect(Math.round((bbox.max[0] - bbox.min[0]) * 100) / 100).toBe(meta.generatedDimensionsMm.width);
  });

  it("derives dims, warnings, mesh hash, and bodyCount from the build — not project.generated", () => {
    // Stored `generated` carries the CORRECT key (so readiness passes) but deliberately
    // WRONG dims/warnings/bodies. None of that garbage may leak into the exported metadata.
    const project = createSampleProject(1_000_000);
    const truth = buildBracketMesh(project);
    if (!truth.ok) throw new Error("build failed");
    const key = generationKey(project)!;
    project.generated = {
      sourceVersion: project.version,
      key,
      paramsHash: key,
      dims: { widthMm: 999, depthMm: 999, heightMm: 999, standoffCount: 99, bodies: 7, triangles: 3 },
      warnings: ["stale warning that must not appear"],
      createdAt: 0,
      durationMs: null,
    };
    const built = buildExport(project, { format: "stl", writeSidecar: true, now: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const meta = built.artifact.metadata;
    expect(meta.meshHash).toBe(truth.meshHash);
    expect(meta.bodyCount).toBe(1); // not the stale 7
    expect(meta.generatedDimensionsMm.width).toBe(truth.dims.widthMm); // not 999
    expect(meta.warnings).not.toContain("stale warning that must not appear");
  });

});

describe("every semantic mount field is covered by the geometry contract (reviewer #6)", () => {
  const build = (mut: (p: Project) => void) => {
    const p = createSampleProject(1_000_000);
    mut(p);
    const r = buildBracketMesh(p);
    if (!r.ok) throw new Error(`build failed: ${r.error.code}`);
    return { hash: r.meshHash, key: generationKey(p)! };
  };
  const baseline = build(() => {});

  // A COMPLETE contract over every MountStrategy field — not a hand-picked subset. Each field
  // is classified by effect: "mesh" changes the welded mesh AND the generation key; "key-only"
  // changes the key but not the mesh; "seed" is a NEW-hole default that is deliberately excluded
  // from the geometry key, so it changes neither (reviewer #3 — the cut authority is per-hole).
  // The completeness guard fails if a field is added to MountStrategy without a classifier here.
  type Effect = "mesh" | "key-only" | "seed";
  const CONTRACT: Record<keyof MountStrategy, { effect: Effect; mutate: (p: Project) => void }> = {
    kind: { effect: "mesh", mutate: (p) => (p.mount.kind = "standoff-bridge") },
    standoffHeightMm: { effect: "mesh", mutate: (p) => (p.mount.standoffHeightMm = measured(9)) },
    baseThicknessMm: { effect: "mesh", mutate: (p) => (p.mount.baseThicknessMm = measured(4)) },
    // Seeds for new holes only — never in the geometry key, never cut into the solid.
    defaultFastener: { effect: "seed", mutate: (p) => (p.mount.defaultFastener = "M4") },
    defaultFastenerStyle: { effect: "seed", mutate: (p) => (p.mount.defaultFastenerStyle = "through-bolt") },
    bossDiameterMm: { effect: "mesh", mutate: (p) => (p.mount.bossDiameterMm = measured(8)) },
    sideTabs: { effect: "mesh", mutate: (p) => (p.mount.sideTabs = 4) },
    clearanceMm: { effect: "mesh", mutate: (p) => (p.mount.clearanceMm = measured(0.5)) },
    tolerance: { effect: "mesh", mutate: (p) => (p.mount.tolerance = "sla-0.05") },
    customToleranceMm: {
      effect: "mesh",
      mutate: (p) => {
        p.mount.tolerance = "custom";
        p.mount.customToleranceMm = 0.33;
      },
    },
  };

  it("classifies every MountStrategy field (no field silently untested)", () => {
    expect(Object.keys(CONTRACT).sort()).toEqual(Object.keys(defaultMount()).sort());
  });

  for (const field of Object.keys(CONTRACT) as (keyof MountStrategy)[]) {
    const { effect, mutate } = CONTRACT[field];
    it(`${field}: ${effect}`, () => {
      const got = build(mutate);
      if (effect === "seed") {
        expect(got.key, "seed default must NOT change the geometry key").toBe(baseline.key);
        expect(got.hash, "seed default must NOT change the mesh").toBe(baseline.hash);
      } else {
        expect(got.key, "generation key must change").not.toBe(baseline.key);
        if (effect === "mesh") expect(got.hash, "mesh hash must change").not.toBe(baseline.hash);
        else expect(got.hash, "mesh hash must NOT change (recorded, not cut)").toBe(baseline.hash);
      }
    });
  }
});
