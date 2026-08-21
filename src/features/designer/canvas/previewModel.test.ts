import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { generationKey } from "@/core/project/derive";
import { buildBracketMesh } from "@/core/geometry/mesh";
import { measured } from "@/core/project/value";
import type { GeneratedModel } from "@/core/project/types";
import { previewModel } from "./previewModel";

/**
 * Reviewer #5: the 3D preview must never pair a live mesh with stale stored dimensions.
 * previewModel is the single seam the preview and the export view render from; these
 * tests pin that its mesh/dims/warnings always come from ONE live build, and that
 * `provenance` reports recorded-vs-draft without changing which build the numbers use.
 */
function recordGeneration(project: ReturnType<typeof createSampleProject>): void {
  const built = buildBracketMesh(project);
  if (!built.ok) throw new Error("fixture should build");
  const key = generationKey(project)!;
  const gen: GeneratedModel = {
    sourceVersion: project.version,
    key,
    paramsHash: key,
    dims: built.dims,
    warnings: built.warnings,
    createdAt: 1234,
    durationMs: 12.5,
  };
  project.generated = gen;
}

describe("previewModel — preview and metadata share one build (reviewer #5)", () => {
  it("labels a matching recorded generation as 'generated' and mirrors the live dims", () => {
    const p = createSampleProject(1);
    recordGeneration(p);
    const preview = previewModel(p);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.provenance).toBe("generated");
    expect(preview.recordedAt).toBe(1234);
    expect(preview.recordedDurationMs).toBe(12.5);
    // Dims are the live build's, which for a current model equals the recorded dims.
    const live = buildBracketMesh(p);
    expect(live.ok).toBe(true);
    if (live.ok) expect(preview.dims).toEqual(live.dims);
  });

  it("auto-off edit: shows a live draft whose dims come from the edit, NOT the stale record", () => {
    const p = createSampleProject(1);
    recordGeneration(p);
    const staleRecordedDims = p.generated!.dims;

    // Edit a geometry-affecting dimension with the generation still pointing at the old key
    // (this is exactly the "auto-generate off, user edits" case). Raising the standoff
    // height changes both the generation key AND the reported bracket height.
    p.mount.standoffHeightMm = measured(staleRecordedDims.heightMm + 10);

    const preview = previewModel(p);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    // The record is now stale, so the preview is a labelled live draft, not "generated".
    expect(preview.provenance).toBe("draft");
    expect(preview.hasPriorGeneration).toBe(true);
    expect(preview.recordedAt).toBeNull();

    // The dims MUST be the freshly-built ones, never the stale stored dims.
    const live = buildBracketMesh(p);
    expect(live.ok).toBe(true);
    if (live.ok) {
      expect(preview.dims).toEqual(live.dims);
      expect(preview.warnings).toEqual(live.warnings);
    }
    expect(preview.dims.heightMm).not.toBe(staleRecordedDims.heightMm);
  });

  it("never-generated model previews as a draft flagged 'not generated yet'", () => {
    const p = createSampleProject(1);
    expect(p.generated).toBeNull();
    const preview = previewModel(p);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.provenance).toBe("draft");
    expect(preview.hasPriorGeneration).toBe(false);
    expect(preview.recordedAt).toBeNull();
  });

  it("reports the blocking error message when the current model cannot build", () => {
    const p = createSampleProject(1);
    // Remove a required fabrication input so the build fails honestly.
    p.mount.bossDiameterMm = { known: false };
    const preview = previewModel(p);
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.message.length).toBeGreaterThan(0);
  });

  it("preserves the coded diagnostic on a build failure (reviewer #2)", () => {
    const p = createSampleProject(1);
    p.mount.bossDiameterMm = { known: false };
    const preview = previewModel(p);
    expect(preview.ok).toBe(false);
    if (!preview.ok) {
      expect(preview.code).toBe("MISSING_BOSS");
      expect(preview.feature).toBeTruthy();
    }
  });
});
