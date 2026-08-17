/**
 * Canonical semantic document model for Board Mount Designer (MVP subset).
 * This is the source of truth: preview and export derive from it, never the reverse.
 * Geometry that lives on the reference image (outline vertices, hole centers,
 * keep-out shapes) is stored in IMAGE-PIXEL space; millimetre values are derived
 * through the calibration transform (see core/project/derive.ts). Values the image
 * cannot safely supply (thickness, diameter, clearances) are typed directly in mm
 * and wrapped in Val<T> so unknown is never zero.
 */
import type { Point, Rect } from "@/core/geom";
import type { Unit } from "@/core/units/units";
import type { Val } from "./value";

export const SCHEMA_VERSION = 1 as const;
export const GENERATOR_VERSION = "0.1 draft" as const;

export type ProvenanceState = "inferred" | "measured" | "confirmed";

export type CalibrationSourceKind =
  | "calipers"
  | "datasheet"
  | "ruler-in-photo"
  | "known-feature"
  | "other";

export interface CaptureInfo {
  /** e.g. "Photo — phone camera, roughly top-down" */
  label: string;
  kind: "photo" | "scan" | "drawing" | "unknown";
}

export interface ReferenceImage {
  id: string;
  /** Original file/display name, e.g. "mg-dev-01_top.jpg". */
  assetName: string;
  /** Data URL or app-relative asset path. Kept local; never uploaded. */
  src: string;
  widthPx: number;
  heightPx: number;
  /** Photo rotation applied for display only (reference is a photo, not aligned geometry). */
  rotationDeg: number;
  capture: CaptureInfo;
  addedAt: number;
  /** True when the saved asset can't be found at reopen (missing-image recovery). */
  missing?: boolean;
}

export type CalibrationStatus = "uncalibrated" | "valid" | "invalid";

export interface Calibration {
  id: string;
  /** Two anchor points in image-pixel space. */
  anchors: [Point, Point];
  /** Known real distance between anchors, in mm. */
  knownMm: Val<number>;
  source: CalibrationSourceKind;
  /** Derived pixels-per-mm when status === "valid". */
  pxPerMm: number | null;
  status: CalibrationStatus;
  /** Machine reason + human message retained for the invalid state. */
  rejectReason?: string;
  rejectMessage?: string;
  createdAt: number;
}

export interface BoardOutline {
  /** Closed polygon vertices in image-pixel space. */
  vertices: Point[];
  /** Corner radius in mm (Val — may be unknown for a hard-cornered board). */
  cornerRadiusMm: Val<number>;
  confirmed: boolean;
}

export type FastenerChoice = "M2" | "M2.5" | "M3" | "M4" | "custom";

export interface MountingHole {
  id: string;
  /** Short label, e.g. "H1". */
  label: string;
  /** Center in image-pixel space. */
  centerPx: Point;
  /** Drill/clearance diameter in mm. Unknown blocks generation. */
  diameterMm: Val<number>;
  fastener: FastenerChoice;
  /** How the position was obtained. */
  positionSource: "clicked-calibrated" | "typed" | "inferred-pattern";
  /** Provenance state for the whole feature (drives the chip). */
  state: ProvenanceState;
}

export type KeepOutShape = "rect" | "circle" | "polygon";
export type BoardSide = "top" | "bottom";

export interface KeepOut {
  id: string;
  label: string;
  /** Human purpose that travels with the board definition. */
  purpose: string;
  shape: KeepOutShape;
  boardSide: BoardSide;
  /** One of the following is populated depending on `shape`, all in image-pixel space. */
  rectPx?: Rect;
  circlePx?: { center: Point; radiusPx: number };
  polygonPx?: Point[];
  /** Reserved clearance height above the board, in mm. */
  clearanceHeightMm: Val<number>;
  state: ProvenanceState;
}

export interface Board {
  id: string;
  name: string;
  revision: string;
  outline: BoardOutline | null;
  thicknessMm: Val<number>;
  holes: MountingHole[];
  keepOuts: KeepOut[];
}

export type MountStrategyKind = "plate-standoffs" | "rect-plate" | "standoff-bridge";
export type ToleranceProfile = "fdm-0.20" | "fdm-0.15" | "sla-0.05" | "custom";

export interface MountStrategy {
  kind: MountStrategyKind;
  standoffHeightMm: Val<number>;
  baseThicknessMm: Val<number>;
  fastener: FastenerChoice;
  fastenerStyle: "heat-set-insert" | "self-tapping" | "through-bolt";
  bossDiameterMm: Val<number>;
  sideTabs: 0 | 2 | 4;
  clearanceMm: Val<number>;
  tolerance: ToleranceProfile;
}

export interface GeneratedDimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  standoffCount: number;
  bodies: number;
  /** Preview-only triangle estimate; not a fabrication claim. */
  triangles: number;
}

export interface GeneratedModel {
  /** Project.version at generation time. */
  sourceVersion: number;
  paramsHash: string;
  dims: GeneratedDimensions;
  warnings: string[];
  createdAt: number;
  durationMs: number;
  /** Whether this generation is still consistent with the current model. */
  upToDate: boolean;
}

export type ExportFormat = "step" | "stl";

export interface ExportRecord {
  id: string;
  format: ExportFormat;
  fileName: string;
  sizeBytes: number;
  paramsHash: string;
  createdAt: number;
  wroteSidecar: boolean;
}

export interface Project {
  id: string;
  name: string;
  schemaVersion: number;
  /** Monotonic edit counter (the mockups show "project v14"). */
  version: number;
  units: Unit;
  createdAt: number;
  updatedAt: number;
  generatorVersion: string;
  reference: ReferenceImage | null;
  calibration: Calibration | null;
  board: Board;
  mount: MountStrategy;
  generated: GeneratedModel | null;
  exports: ExportRecord[];
}

/** A board definition saved to the local library for reuse across mount strategies. */
export interface SavedBoardDefinition {
  id: string;
  name: string;
  revision: string;
  savedAt: number;
  board: Board;
  calibration: Calibration | null;
}
