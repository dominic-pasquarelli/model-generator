/**
 * Validation model. Every finding states what is wrong, why it matters, and which
 * input fixes it (interaction contract). Errors block generation/export; warnings
 * persist without blocking; info never nags. The vocabulary and examples mirror the
 * mockup validation panels (screens 02–08).
 */
import { bbox, rectIntersectsCircle, circlesOverlap, type Point } from "@/core/geom";
import type { KeepOut, Project } from "@/core/project/types";
import { boardFrame } from "@/core/project/derive";
import { isKnown, maybe } from "@/core/project/value";

export type Severity = "error" | "warning" | "info";

export type StepId =
  | "reference"
  | "calibrate"
  | "outline"
  | "holes"
  | "keepouts"
  | "measurements"
  | "mount"
  | "export";

export interface FixTarget {
  step?: StepId;
  holeId?: string;
  keepOutId?: string;
  field?: string;
}

export interface Validation {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  fix?: { label: string; target: FixTarget };
  /** What the finding is about, for cross-highlighting and step flags. */
  relatesTo?: { step?: StepId; holeId?: string; keepOutId?: string };
}

export interface ValidationSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export function summarize(items: Validation[]): ValidationSummary {
  return {
    errors: items.filter((v) => v.severity === "error").length,
    warnings: items.filter((v) => v.severity === "warning").length,
    infos: items.filter((v) => v.severity === "info").length,
  };
}

export function blockingErrors(items: Validation[]): Validation[] {
  return items.filter((v) => v.severity === "error");
}

/** Standoff-seat radius (px) around a hole, from the mount boss diameter. */
function seatRadiusPx(project: Project, pxPerMm: number): number {
  const boss = maybe(project.mount.bossDiameterMm) ?? 7;
  return (boss / 2) * pxPerMm;
}

function keepOutHitsCircle(k: KeepOut, center: Point, radiusPx: number): boolean {
  if (k.shape === "rect" && k.rectPx) return rectIntersectsCircle(k.rectPx, center, radiusPx);
  if (k.shape === "circle" && k.circlePx)
    return circlesOverlap(center, radiusPx, k.circlePx.center, k.circlePx.radiusPx);
  if (k.shape === "polygon" && k.polygonPx && k.polygonPx.length >= 3) {
    const box = bbox(k.polygonPx);
    return rectIntersectsCircle(box, center, radiusPx);
  }
  return false;
}

export function validateProject(project: Project): Validation[] {
  const out: Validation[] = [];
  const { reference, calibration, board } = project;

  // ---- Reference ----
  if (!reference) {
    out.push({
      id: "no-reference",
      severity: "error",
      title: "No board reference",
      body: "Outline, holes, and keep-outs need a reference to trace against. Generation and export stay blocked.",
      fix: { label: "Add reference", target: { step: "reference" } },
      relatesTo: { step: "reference" },
    });
    out.push({
      id: "nothing-measured",
      severity: "info",
      title: "Nothing is measured yet",
      body: "Every value starts as unknown. States move from Uncalibrated → Measured → Confirmed as you supply trusted inputs.",
    });
    return out; // Nothing else is meaningful without a reference.
  }

  if (reference.missing) {
    out.push({
      id: "reference-missing",
      severity: "warning",
      title: "Reference image is missing",
      body: "The saved reference can't be found at its last location. Your board definition is intact — outline, holes, keep-outs, and calibration are stored in the project, not the image.",
      fix: { label: "Locate image", target: { step: "reference" } },
      relatesTo: { step: "reference" },
    });
  }

  // ---- Calibration ----
  const isCalibrated = !!calibration && calibration.status === "valid" && calibration.pxPerMm != null;
  if (!isCalibrated) {
    if (calibration && calibration.status === "invalid") {
      out.push({
        id: "calibration-invalid",
        severity: "error",
        title: "Entered distance is implausible",
        body:
          calibration.rejectMessage ??
          "The entered distance implies an implausible scale. Fix the distance value or its units.",
        fix: { label: "Edit distance", target: { step: "calibrate", field: "knownMm" } },
        relatesTo: { step: "calibrate" },
      });
    }
    out.push({
      id: "uncalibrated",
      severity: "error",
      title: "Reference is uncalibrated",
      body: "Outline and hole positions can be sketched, but nothing gets millimetre values — generation and export stay blocked until a valid calibration exists.",
      fix: { label: "Calibrate", target: { step: "calibrate" } },
      relatesTo: { step: "calibrate" },
    });
    // Without scale, per-feature mm checks are not meaningful yet.
    return out;
  }

  const pxPerMm = calibration!.pxPerMm!;
  out.push({
    id: "calibrated-info",
    severity: "info",
    title: `Calibrated at ${pxPerMm.toFixed(1)} px/mm`,
    body: `From a ${
      isKnown(calibration!.knownMm) ? calibration!.knownMm.value.toFixed(2) : "?"
    } mm ${calibrationSourceLabel(calibration!.source)} measurement (A–B). Source is recorded with the project.`,
    relatesTo: { step: "calibrate" },
  });

  // ---- Outline ----
  if (!board.outline || board.outline.vertices.length < 3) {
    out.push({
      id: "no-outline",
      severity: board.holes.length > 0 ? "warning" : "info",
      title: "Board outline not defined",
      body: "Trace the board edge so the generator has a plate boundary to build on.",
      fix: { label: "Draw outline", target: { step: "outline" } },
      relatesTo: { step: "outline" },
    });
  }

  // ---- Holes ----
  for (const h of board.holes) {
    if (!isKnown(h.diameterMm)) {
      out.push({
        id: `hole-no-diameter-${h.id}`,
        severity: "error",
        title: `${h.label} has no diameter`,
        body: "The generator can't size its standoff or screw hole. Enter the drill or screw size to unblock generation.",
        fix: { label: "Enter ⌀", target: { step: "holes", holeId: h.id, field: "diameterMm" } },
        relatesTo: { step: "holes", holeId: h.id },
      });
    }
    if (h.state === "inferred") {
      out.push({
        id: `hole-inferred-${h.id}`,
        severity: "warning",
        title: `${h.label} position is inferred`,
        body: "Suggested from the hole pattern, not measured. Confirm it or type measured values.",
        fix: { label: "Review", target: { step: "holes", holeId: h.id } },
        relatesTo: { step: "holes", holeId: h.id },
      });
    }
  }

  // ---- Keep-outs vs standoff seats ----
  const frame = boardFrame(project);
  const seat = seatRadiusPx(project, pxPerMm);
  const outlineBox = board.outline ? bbox(board.outline.vertices) : null;
  for (const k of board.keepOuts) {
    for (const h of board.holes) {
      if (keepOutHitsCircle(k, h.centerPx, seat)) {
        out.push({
          id: `keepout-hits-${k.id}-${h.id}`,
          severity: "warning",
          title: `${k.label} overlaps mounting hole ${h.label}`,
          body: `The keep-out crosses ${h.label}'s standoff seat, shrinking its contact area. Shrink the keep-out, move it, or accept a smaller seat.`,
          fix: { label: "Show fix options", target: { step: "keepouts", keepOutId: k.id } },
          relatesTo: { step: "keepouts", keepOutId: k.id },
        });
      }
    }
    if (outlineBox && keepOutExceeds(k, outlineBox)) {
      out.push({
        id: `keepout-past-edge-${k.id}`,
        severity: "info",
        title: `${k.label} extends past the board edge`,
        body: "Intentional for plug or connector access — the mount will keep this approach clear.",
        relatesTo: { step: "keepouts", keepOutId: k.id },
      });
    }
  }
  void frame; // reserved for future mm-space checks

  // ---- Thickness ----
  if (!isKnown(board.thicknessMm)) {
    out.push({
      id: "thickness-unknown",
      severity: "warning",
      title: "Board thickness not measured",
      body: "Standoff seating and clearance depend on it. Enter the measured board thickness.",
      fix: { label: "Enter thickness", target: { step: "measurements", field: "thicknessMm" } },
      relatesTo: { step: "measurements" },
    });
  }

  // ---- Generation warnings ----
  if (project.generated) {
    for (const [i, w] of project.generated.warnings.entries()) {
      out.push({
        id: `gen-warn-${i}`,
        severity: "warning",
        title: w,
        body: "From the last generation. Preview reflects it; consider adjusting the semantic model.",
        relatesTo: { step: "mount" },
      });
    }
    out.push({
      id: "preview-not-proof",
      severity: "info",
      title: "Preview is not physical proof",
      body: "Fit claims need a printed part. Export records what was generated, from which parameters.",
      relatesTo: { step: "mount" },
    });
  }

  if (project.exports.length > 0) {
    out.push({
      id: "fit-unverified",
      severity: "info",
      title: "Physical fit is unverified",
      body: "Export ≠ fit. Print and check against the real board before trusting the mount in service.",
      relatesTo: { step: "export" },
    });
  }

  return out;
}

function keepOutExceeds(k: KeepOut, outlineBox: { x: number; y: number; w: number; h: number }): boolean {
  let box: { x: number; y: number; w: number; h: number } | null = null;
  if (k.shape === "rect" && k.rectPx) box = k.rectPx;
  else if (k.shape === "circle" && k.circlePx)
    box = {
      x: k.circlePx.center.x - k.circlePx.radiusPx,
      y: k.circlePx.center.y - k.circlePx.radiusPx,
      w: k.circlePx.radiusPx * 2,
      h: k.circlePx.radiusPx * 2,
    };
  else if (k.shape === "polygon" && k.polygonPx && k.polygonPx.length >= 3) box = bbox(k.polygonPx);
  if (!box) return false;
  return (
    box.x < outlineBox.x ||
    box.y < outlineBox.y ||
    box.x + box.w > outlineBox.x + outlineBox.w ||
    box.y + box.h > outlineBox.y + outlineBox.h
  );
}

function calibrationSourceLabel(source: string): string {
  switch (source) {
    case "calipers":
      return "caliper";
    case "datasheet":
      return "datasheet";
    case "ruler-in-photo":
      return "ruler";
    case "known-feature":
      return "known-feature";
    default:
      return "";
  }
}

// ---- Export readiness ----

export interface ExportReadiness {
  ready: boolean;
  blockers: Validation[];
  checklist: string[];
}

/** Export writes only trustworthy geometry: no errors, calibrated, and a generation exists. */
export function exportReadiness(project: Project, items = validateProject(project)): ExportReadiness {
  const blockers = blockingErrors(items);
  const isCalibrated =
    !!project.calibration && project.calibration.status === "valid" && project.calibration.pxPerMm != null;
  const hasGeneration = !!project.generated && project.generated.upToDate;
  const checklist: string[] = [];
  if (isCalibrated) checklist.push(`Calibrated ${project.calibration!.pxPerMm!.toFixed(1)} px/mm`);
  if (project.board.outline?.confirmed)
    checklist.push(`Outline and ${project.board.holes.length} holes captured`);
  if (isKnown(project.board.thicknessMm))
    checklist.push(`Board thickness measured · ${project.board.thicknessMm.value.toFixed(2)} mm`);
  if (hasGeneration) checklist.push("Generated bracket avoids all keep-outs");
  const summary = summarize(items);
  checklist.push(`${summary.errors} errors · ${summary.warnings} warnings · model v${project.version}`);
  return { ready: blockers.length === 0 && isCalibrated && hasGeneration, blockers, checklist };
}
