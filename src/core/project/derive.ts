/**
 * Derived (never stored) millimetre readouts computed from the canonical model
 * through the calibration transform. If there is no valid calibration or no
 * outline, board-frame millimetres are simply unavailable — callers must handle
 * the absence rather than defaulting to zero.
 */
import { bbox, type Point, type Rect } from "@/core/geom";
import type { MountingHole, Project } from "./types";
import { isKnown, maybe, type Val } from "./value";

export interface BoardFrame {
  /** Image-pixel origin (outline bounding-box min) that board-mm are measured from. */
  originPx: Point;
  pxPerMm: number;
}

/** The frame that lets us express image pixels as board millimetres, or null. */
export function boardFrame(project: Project): BoardFrame | null {
  const cal = project.calibration;
  const outline = project.board.outline;
  if (!cal || cal.status !== "valid" || cal.pxPerMm == null) return null;
  if (!outline || outline.vertices.length < 3) return null;
  const box = bbox(outline.vertices);
  return { originPx: { x: box.x, y: box.y }, pxPerMm: cal.pxPerMm };
}

export function pxPointToBoardMm(p: Point, frame: BoardFrame): Point {
  return {
    x: (p.x - frame.originPx.x) / frame.pxPerMm,
    y: (p.y - frame.originPx.y) / frame.pxPerMm,
  };
}

export function boardMmToPxPoint(mm: Point, frame: BoardFrame): Point {
  return {
    x: mm.x * frame.pxPerMm + frame.originPx.x,
    y: mm.y * frame.pxPerMm + frame.originPx.y,
  };
}

export interface OutlineDims {
  widthMm: number;
  heightMm: number;
  corners: number;
}

/** Outline width/height in mm — only when calibrated. */
export function outlineDims(project: Project): OutlineDims | null {
  const frame = boardFrame(project);
  const outline = project.board.outline;
  if (!frame || !outline) return null;
  const box = bbox(outline.vertices);
  return {
    widthMm: box.w / frame.pxPerMm,
    heightMm: box.h / frame.pxPerMm,
    corners: outline.vertices.length,
  };
}

export interface HoleMm {
  hole: MountingHole;
  centerMm: Point | null;
  diameterMm: number | null;
}

export function holeMm(hole: MountingHole, frame: BoardFrame | null): HoleMm {
  return {
    hole,
    centerMm: frame ? pxPointToBoardMm(hole.centerPx, frame) : null,
    diameterMm: isKnown(hole.diameterMm) ? hole.diameterMm.value : null,
  };
}

/**
 * Radius (px) of a standoff seat around a hole, from the mount boss diameter.
 * Returns null when there is no valid scale OR the boss diameter is unknown —
 * callers must then SKIP seat/keep-out overlap reasoning rather than assume a size.
 */
export function standoffSeatRadiusPx(project: Project): number | null {
  const cal = project.calibration;
  if (!cal || cal.status !== "valid" || cal.pxPerMm == null) return null;
  const boss = maybe(project.mount.bossDiameterMm);
  if (boss == null) return null;
  return (boss / 2) * cal.pxPerMm;
}

/** Pixel length → mm using the calibration scale only (no origin needed). */
export function pxToMm(project: Project, pxLen: number): number | null {
  const cal = project.calibration;
  if (!cal || cal.status !== "valid" || cal.pxPerMm == null) return null;
  return pxLen / cal.pxPerMm;
}

/** Rectangle (px) → mm width/height using the calibration scale. */
export function rectMm(project: Project, r: Rect): { w: number; h: number } | null {
  const cal = project.calibration;
  if (!cal || cal.status !== "valid" || cal.pxPerMm == null) return null;
  return { w: r.w / cal.pxPerMm, h: r.h / cal.pxPerMm };
}

/**
 * The deterministic parameter tuple that generation hashes. Anything that changes
 * the generated bracket must appear here so preview/export stay in lockstep.
 */
export function generationParams(project: Project): Record<string, unknown> {
  const dims = outlineDims(project);
  const m = project.mount;
  return {
    // `units` is display-only and never affects geometry, so it is deliberately
    // excluded — a mm/inch toggle must not change the generated result's hash.
    schema: project.schemaVersion,
    outline: dims ? { w: round4(dims.widthMm), h: round4(dims.heightMm), corners: dims.corners } : null,
    cornerRadius: numOrNull(project.board.outline?.cornerRadiusMm),
    thickness: numOrNull(project.board.thicknessMm),
    holes: project.board.holes.map((h) => ({
      d: numOrNull(h.diameterMm),
      fastener: h.fastener,
      // Board-mm position keeps the hash stable under pan/zoom (which never change px coords anyway).
      pos: roundPoint(h.centerPx),
    })),
    keepOuts: project.board.keepOuts.map((k) => ({
      shape: k.shape,
      side: k.boardSide,
      clearance: numOrNull(k.clearanceHeightMm),
      // Keep-out geometry affects seat-clip warnings, so it must be in the hash.
      geom:
        k.shape === "rect" && k.rectPx
          ? { x: round2p(k.rectPx.x), y: round2p(k.rectPx.y), w: round2p(k.rectPx.w), h: round2p(k.rectPx.h) }
          : k.shape === "circle" && k.circlePx
            ? { cx: round2p(k.circlePx.center.x), cy: round2p(k.circlePx.center.y), r: round2p(k.circlePx.radiusPx) }
            : k.shape === "polygon" && k.polygonPx
              ? { poly: k.polygonPx.map(roundPoint) }
              : null,
    })),
    mount: {
      kind: m.kind,
      standoff: numOrNull(m.standoffHeightMm),
      base: numOrNull(m.baseThicknessMm),
      fastener: m.fastener,
      style: m.fastenerStyle,
      boss: numOrNull(m.bossDiameterMm),
      tabs: m.sideTabs,
      clearance: numOrNull(m.clearanceMm),
      tolerance: m.tolerance,
    },
  };
}

function numOrNull(v: Val<number> | undefined): number | null {
  if (!v) return null;
  const m = maybe(v);
  return m === undefined ? null : m;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
function round2p(n: number): number {
  return Math.round(n * 100) / 100;
}
function roundPoint(p: Point): Point {
  return { x: round2p(p.x), y: round2p(p.y) };
}
