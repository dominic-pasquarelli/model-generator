/**
 * Illustrative sample projects for the local library. The board (MG-DEV-01) is a
 * fictional sample; every trace, hole, and zone was placed by hand for the mockups.
 * Coordinates live in the sample photo's intrinsic pixel space (1000×660); the
 * calibration (78 mm across the top holes → 10 px/mm) reproduces the mockup's
 * 85.00 × 56.00 mm board exactly through the real derivation path.
 */
import { BOARD_PHOTO_SRC, SAMPLE_IMAGE } from "@/assets";
import { uid } from "@/lib/id";
import { createProject } from "./schema";
import type { Calibration, KeepOut, MountingHole, Project, ReferenceImage } from "./types";
import { confirmed, measured } from "./value";

const DAY = 24 * 60 * 60 * 1000;

function sampleReference(now: number): ReferenceImage {
  return {
    id: uid("ref"),
    assetName: "mg-dev-01_top.jpg",
    src: BOARD_PHOTO_SRC,
    widthPx: SAMPLE_IMAGE.widthPx,
    heightPx: SAMPLE_IMAGE.heightPx,
    rotationDeg: -2,
    capture: { label: "Photo — phone camera, roughly top-down", kind: "photo" },
    addedAt: now,
  };
}

function sampleCalibration(now: number): Calibration {
  return {
    id: uid("cal"),
    anchors: [
      { x: 110, y: 85 },
      { x: 890, y: 85 },
    ],
    knownMm: measured(78, "Calipers — hole-to-hole centers"),
    source: "calipers",
    pxPerMm: 10,
    status: "valid",
    createdAt: now,
  };
}

function hole(
  label: string,
  x: number,
  y: number,
  state: MountingHole["state"],
  positionSource: MountingHole["positionSource"] = "clicked-calibrated",
): MountingHole {
  return {
    id: uid("hole"),
    label,
    centerPx: { x, y },
    diameterMm: state === "confirmed" ? confirmed(3.2) : measured(3.2),
    fastener: "M3",
    positionSource,
    state,
  };
}

function keepOuts(): KeepOut[] {
  return [
    {
      id: uid("ko"),
      label: "KO-1",
      purpose: "USB plug access",
      shape: "rect",
      boardSide: "top",
      rectPx: { x: 798, y: 234, w: 180, h: 192 },
      clearanceHeightMm: measured(15),
      state: "measured",
    },
    {
      id: uid("ko"),
      label: "KO-2",
      purpose: "C7 capacitor",
      shape: "circle",
      boardSide: "top",
      circlePx: { center: { x: 700, y: 490 }, radiusPx: 58 },
      clearanceHeightMm: measured(11),
      state: "measured",
    },
    {
      id: uid("ko"),
      label: "KO-3",
      purpose: "Wire channel",
      shape: "rect",
      boardSide: "top",
      rectPx: { x: 620, y: 520, w: 300, h: 80 },
      clearanceHeightMm: measured(8),
      state: "inferred",
    },
  ];
}

function sampleOutline() {
  return {
    vertices: [
      { x: 75, y: 50 },
      { x: 925, y: 50 },
      { x: 925, y: 610 },
      { x: 75, y: 610 },
    ],
    cornerRadiusMm: measured(2.4),
    confirmed: true,
  };
}

/** Fully-populated, generatable project (one inferred hole → a single warning, zero errors). */
export function createSampleProject(now = Date.now()): Project {
  const p = createProject({ name: "cm4-carrier-mount-a", now: now - 2 * 60 * 60 * 1000 });
  p.version = 14;
  p.updatedAt = now - 2 * 60 * 60 * 1000;
  p.reference = sampleReference(p.createdAt);
  p.calibration = sampleCalibration(p.createdAt);
  p.board.name = "MG-DEV-01";
  p.board.revision = "rev B";
  p.board.outline = sampleOutline();
  p.board.thicknessMm = measured(1.6);
  p.board.holes = [
    hole("H1", 110, 85, "confirmed"),
    hole("H2", 890, 85, "measured"),
    hole("H3", 110, 575, "confirmed"),
    hole("H4", 890, 575, "inferred", "inferred-pattern"),
  ];
  p.board.keepOuts = keepOuts();
  return p;
}

/** A lighter generated draft for the library grid. */
export function createGeneratedDraft(now = Date.now()): Project {
  const p = createProject({ name: "sensor-node-bracket", now: now - DAY });
  p.version = 8;
  p.updatedAt = now - DAY;
  p.reference = sampleReference(p.createdAt);
  p.calibration = sampleCalibration(p.createdAt);
  p.board.name = "SN-2";
  p.board.revision = "rev A";
  p.board.outline = sampleOutline();
  p.board.thicknessMm = measured(1.6);
  p.board.holes = [hole("H1", 110, 85, "confirmed"), hole("H2", 890, 85, "measured"), hole("H3", 110, 575, "measured")];
  p.mount.sideTabs = 4;
  return p;
}

/** An early uncalibrated draft — reference added, nothing measured yet. */
export function createUncalibratedDraft(now = Date.now()): Project {
  const p = createProject({ name: "relay-driver-mount", now: now - 5 * DAY });
  p.version = 2;
  p.updatedAt = now - 5 * DAY;
  p.reference = sampleReference(p.createdAt);
  p.board.name = "";
  return p;
}

export function createSeedLibrary(now = Date.now()): Project[] {
  return [createSampleProject(now), createGeneratedDraft(now), createUncalibratedDraft(now)];
}
