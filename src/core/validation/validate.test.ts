import { describe, it, expect } from "vitest";
import { createProject } from "@/core/project/schema";
import { createSampleProject } from "@/core/project/fixtures";
import { mockGenerator } from "@/core/geometry/mockGenerator";
import { measured, unknownVal } from "@/core/project/value";
import type { Calibration, MountingHole } from "@/core/project/types";
import { exportReadiness, summarize, validateProject } from "./validate";

function calibrated(): Calibration {
  return {
    id: "cal",
    anchors: [
      { x: 110, y: 85 },
      { x: 890, y: 85 },
    ],
    knownMm: measured(78, "Calipers — hole-to-hole centers"),
    source: "calipers",
    pxPerMm: 10,
    status: "valid",
    createdAt: 0,
  };
}

function hole(id: string, label: string, x: number, y: number, dia: number | null): MountingHole {
  return {
    id,
    label,
    centerPx: { x, y },
    diameterMm: dia == null ? unknownVal<number>() : measured(dia),
    fastener: "M3",
    positionSource: "clicked-calibrated",
    state: "measured",
  };
}

describe("validateProject", () => {
  it("blocks with a no-reference error on an empty project", () => {
    const p = createProject({ name: "empty" });
    const v = validateProject(p);
    expect(v.find((x) => x.id === "no-reference")?.severity).toBe("error");
    expect(summarize(v).errors).toBe(1);
  });

  it("reports uncalibrated as an error once a reference exists", () => {
    const p = createProject({ name: "ref" });
    p.reference = {
      id: "r",
      assetName: "b.jpg",
      src: "",
      widthPx: 1000,
      heightPx: 660,
      rotationDeg: 0,
      capture: { label: "Photo", kind: "photo" },
      addedAt: 0,
    };
    const v = validateProject(p);
    expect(v.some((x) => x.id === "uncalibrated" && x.severity === "error")).toBe(true);
  });

  it("flags a missing hole diameter as a blocking error", () => {
    const p = createProject({ name: "holes" });
    p.reference = {
      id: "r",
      assetName: "b.jpg",
      src: "",
      widthPx: 1000,
      heightPx: 660,
      rotationDeg: 0,
      capture: { label: "Photo", kind: "photo" },
      addedAt: 0,
    };
    p.calibration = calibrated();
    p.board.outline = {
      vertices: [
        { x: 75, y: 50 },
        { x: 925, y: 50 },
        { x: 925, y: 610 },
        { x: 75, y: 610 },
      ],
      cornerRadiusMm: measured(2.4),
      confirmed: true,
    };
    p.board.holes = [hole("h1", "H1", 110, 85, 3.2), hole("h3", "H3", 110, 575, null)];
    const v = validateProject(p);
    const err = v.find((x) => x.id === "hole-no-diameter-h3");
    expect(err?.severity).toBe("error");
    expect(err?.fix?.label).toBe("Enter ⌀");
  });

  it("warns when a keep-out overlaps a standoff seat", () => {
    const p = createProject({ name: "ko" });
    p.reference = {
      id: "r",
      assetName: "b.jpg",
      src: "",
      widthPx: 1000,
      heightPx: 660,
      rotationDeg: 0,
      capture: { label: "Photo", kind: "photo" },
      addedAt: 0,
    };
    p.calibration = calibrated();
    p.board.outline = {
      vertices: [
        { x: 75, y: 50 },
        { x: 925, y: 50 },
        { x: 925, y: 610 },
        { x: 75, y: 610 },
      ],
      cornerRadiusMm: measured(2.4),
      confirmed: true,
    };
    p.board.thicknessMm = measured(1.6);
    p.board.holes = [hole("h4", "H4", 890, 575, 3.2)];
    p.board.keepOuts = [
      {
        id: "ko3",
        label: "KO-3",
        purpose: "Cable route",
        shape: "rect",
        boardSide: "top",
        rectPx: { x: 620, y: 520, w: 300, h: 80 },
        clearanceHeightMm: measured(8),
        state: "inferred",
      },
    ];
    const v = validateProject(p);
    expect(v.some((x) => x.id === "keepout-hits-ko3-h4")).toBe(true);
  });
});

describe("domain validity (known ≠ valid)", () => {
  it("rejects a non-positive hole diameter", () => {
    const p = createSampleProject(1);
    p.board.holes[0].diameterMm = measured(0);
    expect(validateProject(p).some((v) => v.id.startsWith("hole-bad-diameter") && v.severity === "error")).toBe(true);
  });

  it("rejects non-positive mount height inputs", () => {
    const p = createSampleProject(1);
    p.mount.standoffHeightMm = measured(-2);
    expect(validateProject(p).some((v) => v.id === "mount-standoff-nonpositive" && v.severity === "error")).toBe(true);
  });

  it("rejects a keep-out whose shape and payload disagree", () => {
    const p = createSampleProject(1);
    // Discriminator says circle but there is no circle geometry.
    p.board.keepOuts[0] = { ...p.board.keepOuts[0], shape: "circle", rectPx: undefined, circlePx: undefined };
    expect(validateProject(p).some((v) => v.id.startsWith("keepout-shape") && v.severity === "error")).toBe(true);
  });

  it("blocks export with a NON-EMPTY blocker list when the outline is missing", () => {
    const p = createSampleProject(1);
    p.board.outline = null;
    const r = exportReadiness(p);
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0); // never "0 blockers while ready:false"
    expect(r.blockers.some((b) => b.id === "no-outline")).toBe(true);
  });
});

describe("exportReadiness", () => {
  it("is not ready without a generation", () => {
    const p = createProject({ name: "x" });
    expect(exportReadiness(p).ready).toBe(false);
  });

  it("blocks a fully-drawn board until it is generated, and lists that as a blocker", () => {
    const p = createSampleProject(1); // no `generated` yet
    const r = exportReadiness(p);
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.id === "generation-stale")).toBe(true);
  });

  it("blocks with an error when the mount height inputs are unknown", () => {
    const p = createSampleProject(1_000_000);
    p.mount.standoffHeightMm = unknownVal<number>();
    const v = validateProject(p);
    expect(v.some((x) => x.id === "mount-standoff-unknown" && x.severity === "error")).toBe(true);
    expect(exportReadiness(p, v).ready).toBe(false);
  });

  it("labels generation warnings honestly, never as 'clipped standoff seats' (reviewer #1)", async () => {
    const p = createSampleProject(1_000_000);
    const gen = await mockGenerator.generate(p);
    expect(gen.ok).toBe(true);
    if (gen.ok) p.generated = gen.model;
    const checklist = exportReadiness(p).checklist;
    // The old mislabel is gone; the count is described as generic warnings.
    expect(checklist.some((c) => /clipped standoff seat/.test(c))).toBe(false);
    const n = p.generated!.warnings.length;
    expect(checklist.some((c) => (n === 0 ? /no warnings/ : /\bwarnings?\b/).test(c))).toBe(true);
  });
});
