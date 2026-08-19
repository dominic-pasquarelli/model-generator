/**
 * Derived (never stored) millimetre readouts computed from the canonical model
 * through the calibration transform. If there is no valid calibration or no
 * outline, board-frame millimetres are simply unavailable — callers must handle
 * the absence rather than defaulting to zero.
 */
import { bbox, type Point, type Rect } from "@/core/geom";
import { ACTIVE_ADAPTER_VERSION } from "@/core/geometry/adapter";
import { shortHash } from "@/lib/id";
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
 * The deterministic parameter tuple that generation hashes, expressed in canonical
 * BOARD-SPACE MILLIMETRES (not image pixels). Everything geometry-affecting appears
 * here in full — every outline vertex, every hole center, complete keep-out geometry
 * — plus the mount parameters and the adapter version. Returns null when the board
 * frame is unavailable (uncalibrated or no outline), which means generation is not
 * possible and there is nothing to hash.
 *
 * Consequences of board-space canonicalisation:
 * - Translating the whole image-space definition equally leaves board-mm unchanged →
 *   same key.
 * - Moving the outline while holes stay fixed in pixels moves the board origin →
 *   holes' board-mm change → new key.
 * - A calibration change rescales every board-mm → new key.
 * - Two different polygons that share a bounding box hash differently (full vertices).
 */
export function generationParams(project: Project): Record<string, unknown> | null {
  const frame = boardFrame(project);
  if (!frame) return null;
  const toMm = (p: Point) => roundPoint(pxPointToBoardMm(p, frame));
  const lenMm = (px: number) => round4(px / frame.pxPerMm);
  const m = project.mount;
  const outline = project.board.outline!;
  return {
    adapter: ACTIVE_ADAPTER_VERSION,
    schema: project.schemaVersion,
    // `units` is display-only and never affects geometry, so it is excluded.
    outline: {
      vertices: outline.vertices.map(toMm),
      cornerRadius: numOrNull(outline.cornerRadiusMm),
    },
    thickness: numOrNull(project.board.thicknessMm),
    holes: project.board.holes.map((h) => ({
      d: numOrNull(h.diameterMm),
      fastener: h.fastener,
      pos: toMm(h.centerPx),
    })),
    keepOuts: project.board.keepOuts.map((k) => ({
      shape: k.shape,
      side: k.boardSide,
      clearance: numOrNull(k.clearanceHeightMm),
      geom:
        k.shape === "rect" && k.rectPx
          ? { ...toMm({ x: k.rectPx.x, y: k.rectPx.y }), w: lenMm(k.rectPx.w), h: lenMm(k.rectPx.h) }
          : k.shape === "circle" && k.circlePx
            ? { c: toMm(k.circlePx.center), r: lenMm(k.circlePx.radiusPx) }
            : k.shape === "polygon" && k.polygonPx
              ? { poly: k.polygonPx.map(toMm) }
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

/** Canonical generation key (hash) for the current model, or null when un-generatable. */
export function generationKey(project: Project): string | null {
  const params = generationParams(project);
  if (params == null) return null;
  return shortHash(JSON.stringify(params));
}

/**
 * Whether the stored generation matches the CURRENT semantic model. Freshness is
 * recomputed here — a persisted flag is never trusted as authority.
 */
export function isGenerationCurrent(project: Project): boolean {
  const gen = project.generated;
  if (!gen) return false;
  const key = generationKey(project);
  return key != null && key === gen.key;
}

/** True when the CURRENT model (by key) has an export record — not just "any export". */
export function isCurrentModelExported(project: Project): boolean {
  const key = generationKey(project);
  return key != null && project.exports.some((e) => e.generationKey === key);
}

function numOrNull(v: Val<number> | undefined): number | null {
  if (!v) return null;
  const m = maybe(v);
  return m === undefined ? null : m;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
function roundPoint(p: Point): Point {
  return { x: round4(p.x), y: round4(p.y) };
}
