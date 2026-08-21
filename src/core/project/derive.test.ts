import { describe, it, expect } from "vitest";
import { createSampleProject } from "./fixtures";
import { generationKey, isCurrentModelExported, isGenerationCurrent } from "./derive";
import type { ExportRecord, Project } from "./types";
import { measured } from "./value";

function shiftAll(p: Project, dx: number, dy: number) {
  for (const v of p.board.outline!.vertices) {
    v.x += dx;
    v.y += dy;
  }
  for (const h of p.board.holes) {
    h.centerPx.x += dx;
    h.centerPx.y += dy;
  }
  for (const k of p.board.keepOuts) {
    if (k.rectPx) {
      k.rectPx.x += dx;
      k.rectPx.y += dy;
    }
    if (k.circlePx) {
      k.circlePx.center.x += dx;
      k.circlePx.center.y += dy;
    }
  }
}

describe("generationKey (canonical board-space)", () => {
  it("is stable and non-null for a generatable model", () => {
    const a = createSampleProject(1);
    const b = createSampleProject(1);
    expect(generationKey(a)).not.toBeNull();
    expect(generationKey(a)).toBe(generationKey(b));
  });

  it("is null when the model can't be generated (no outline)", () => {
    const p = createSampleProject(1);
    p.board.outline = null;
    expect(generationKey(p)).toBeNull();
  });

  it("is UNCHANGED when the whole image-space definition is translated equally", () => {
    const base = createSampleProject(1);
    const moved = createSampleProject(1);
    shiftAll(moved, 137, -42);
    expect(generationKey(moved)).toBe(generationKey(base));
  });

  it("CHANGES when the outline moves but the holes stay fixed in pixels", () => {
    const base = createSampleProject(1);
    const moved = createSampleProject(1);
    for (const v of moved.board.outline!.vertices) v.x += 40; // origin shifts, holes don't
    expect(generationKey(moved)).not.toBe(generationKey(base));
  });

  it("CHANGES when the calibration scale changes", () => {
    const base = createSampleProject(1);
    const rescaled = createSampleProject(1);
    rescaled.calibration!.pxPerMm = 12; // was 10
    rescaled.calibration!.knownMm = measured(65);
    expect(generationKey(rescaled)).not.toBe(generationKey(base));
  });

  it("distinguishes two polygons that share a bounding box", () => {
    const a = createSampleProject(1);
    const b = createSampleProject(1);
    a.board.keepOuts[0] = {
      ...a.board.keepOuts[0],
      shape: "polygon",
      rectPx: undefined,
      polygonPx: [
        { x: 200, y: 200 },
        { x: 400, y: 220 },
        { x: 300, y: 400 },
      ],
    };
    b.board.keepOuts[0] = {
      ...b.board.keepOuts[0],
      shape: "polygon",
      rectPx: undefined,
      polygonPx: [
        { x: 200, y: 220 },
        { x: 400, y: 200 },
        { x: 300, y: 400 },
      ],
    };
    expect(generationKey(a)).not.toBe(generationKey(b));
  });
});

describe("isGenerationCurrent / isCurrentModelExported", () => {
  it("recomputes freshness — a persisted key that no longer matches is NOT current", () => {
    const p = createSampleProject(1);
    const key = generationKey(p)!;
    p.generated = { sourceVersion: 1, key, paramsHash: key, dims: { widthMm: 91, depthMm: 62, heightMm: 9, standoffCount: 4, bodies: 1, triangles: 100 }, warnings: [], createdAt: 0, durationMs: null };
    expect(isGenerationCurrent(p)).toBe(true);

    // Tamper: a persisted generation with a stale key cannot mark the model current.
    p.generated = { ...p.generated, key: "deadbeefdeadbeef" };
    expect(isGenerationCurrent(p)).toBe(false);
  });

  it("distinguishes 'has any export' from 'current model exported'", () => {
    const p = createSampleProject(1);
    const key = generationKey(p)!;
    const rec: ExportRecord = { id: "e", format: "step", fileName: "x.step", sizeBytes: 1, artifactSha256: "0".repeat(64), paramsHash: key, generationKey: key, createdAt: 0, wroteSidecar: false };
    p.exports = [rec];
    expect(isCurrentModelExported(p)).toBe(true);

    // A GEOMETRY edit changes the current key; the old export no longer represents it. (Board
    // thickness is deliberately NOT in the key — it does not affect the bracket solid.)
    p.mount.standoffHeightMm = measured(9);
    expect(isCurrentModelExported(p)).toBe(false);
  });
});
