/**
 * Validation model. Every finding states what is wrong, why it matters, and which
 * input fixes it (interaction contract). Errors block generation/export; warnings
 * persist without blocking; info never nags. The vocabulary and examples mirror the
 * mockup validation panels (screens 02–08).
 */
import { bbox, rectIntersectsCircle, circlesOverlap, type Point } from "@/core/geom";
import type { KeepOut, Project } from "@/core/project/types";
import type { MeshResult } from "@/core/geometry/mesh";
import { isGenerationCurrent, outlineDims, standoffSeatRadiusPx } from "@/core/project/derive";
import { isKnown, type Val } from "@/core/project/value";
import { fmtLen, unitLabel } from "@/core/units/units";

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

/**
 * Semantic validation of the canonical model. Validation is CHEAP and never runs the geometry
 * kernel (reviewer #1): the only geometry-derived finding — a genuine coded build failure vs a
 * merely-stale generation — is resolved from the keyed build the store already produced off the
 * main thread and passes in as `build`. When no build status is available (a caller without the
 * cache), a generatable-but-not-current model degrades to "stale/not generated" without
 * building anything here.
 */
export function validateProject(project: Project, build?: MeshResult): Validation[] {
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
  const dims = outlineDims(project);
  if (!board.outline || board.outline.vertices.length < 3) {
    out.push({
      id: "no-outline",
      severity: "error",
      title: "Board outline not defined",
      body: "Trace the board edge so the generator has a plate boundary to build on. Generation and export stay blocked until it exists.",
      fix: { label: "Draw outline", target: { step: "outline" } },
      relatesTo: { step: "outline" },
    });
  } else if (dims && (dims.widthMm <= 0 || dims.heightMm <= 0)) {
    out.push({
      id: "outline-degenerate",
      severity: "error",
      title: "Board outline is degenerate",
      body: "The outline has zero width or height. Re-trace it so it encloses a real area.",
      fix: { label: "Redraw outline", target: { step: "outline" } },
      relatesTo: { step: "outline" },
    });
  }

  // ---- Holes ----
  if (board.outline && board.holes.length === 0) {
    out.push({
      id: "no-holes",
      severity: "error",
      title: "No mounting holes",
      body: "The mount strategy needs at least one mounting hole to place a standoff.",
      fix: { label: "Add a hole", target: { step: "holes" } },
      relatesTo: { step: "holes" },
    });
  }
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
    } else if (!(h.diameterMm.value > 0)) {
      out.push({
        id: `hole-bad-diameter-${h.id}`,
        severity: "error",
        title: `${h.label} diameter must be positive`,
        body: "A zero or negative diameter can't size a standoff or screw hole.",
        fix: { label: "Fix ⌀", target: { step: "holes", holeId: h.id, field: "diameterMm" } },
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
  // Seat radius is null when the boss diameter is unknown → skip overlap reasoning
  // rather than compute it against an assumed size.
  const seat = standoffSeatRadiusPx(project);
  const outlineBox = board.outline ? bbox(board.outline.vertices) : null;
  for (const k of board.keepOuts) {
    const shapeError = keepOutShapeError(k);
    if (shapeError) {
      out.push({
        id: `keepout-shape-${k.id}`,
        severity: "error",
        title: `${k.label} has invalid ${k.shape} geometry`,
        body: shapeError,
        fix: { label: "Fix keep-out", target: { step: "keepouts", keepOutId: k.id } },
        relatesTo: { step: "keepouts", keepOutId: k.id },
      });
    }
    if (isKnown(k.clearanceHeightMm) && k.clearanceHeightMm.value < 0) {
      out.push({
        id: `keepout-clearance-${k.id}`,
        severity: "error",
        title: `${k.label} clearance is negative`,
        body: "A clearance height cannot be negative.",
        fix: { label: "Fix clearance", target: { step: "keepouts", keepOutId: k.id } },
        relatesTo: { step: "keepouts", keepOutId: k.id },
      });
    }
    for (const h of board.holes) {
      if (seat != null && keepOutHitsCircle(k, h.centerPx, seat)) {
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
      // Reconcile the copy with the enforced geometry (reviewer #1/#4): a keep-out is only cut
      // cleanly when it lies WHOLLY inside the plate. A top-side keep-out is inherently clear (the
      // bracket is on the underside), but a bottom-side one that crosses the plate edge cannot be
      // cut as a clean interior pocket and BLOCKS generation — so this is a caution, not a
      // reassurance, for bottom-side keep-outs.
      out.push(
        k.boardSide === "bottom"
          ? {
              id: `keepout-past-edge-${k.id}`,
              severity: "warning",
              title: `${k.label} crosses the board edge`,
              body: "A bottom-side keep-out that crosses the plate edge can't be cut as a clean interior pocket — generation blocks it. Move it wholly inside or outside the plate footprint.",
              fix: { label: "Adjust keep-out", target: { step: "keepouts", keepOutId: k.id } },
              relatesTo: { step: "keepouts", keepOutId: k.id },
            }
          : {
              id: `keepout-past-edge-${k.id}`,
              severity: "info",
              title: `${k.label} extends past the board edge`,
              body: "Top-side clearance above the board — the bracket sits on the underside, so nothing intrudes here.",
              relatesTo: { step: "keepouts", keepOutId: k.id },
            },
      );
    }
  }

  // ---- Mount dimensions (unknown must not become zero; known must be positive) ----
  requirePositive(out, project.mount.standoffHeightMm, {
    id: "mount-standoff",
    label: "Standoff height",
    body: "The bracket height is base + standoff.",
    step: "mount",
    field: "standoffHeightMm",
  });
  requirePositive(out, project.mount.baseThicknessMm, {
    id: "mount-base",
    label: "Base thickness",
    body: "The bracket height is base + standoff.",
    step: "mount",
    field: "baseThicknessMm",
  });
  if (isKnown(project.mount.bossDiameterMm) && !(project.mount.bossDiameterMm.value > 0)) {
    out.push({
      id: "mount-boss-nonpositive",
      severity: "error",
      title: "Boss diameter must be positive",
      body: "A zero or negative boss diameter can't form a standoff seat.",
      fix: { label: "Fix boss ⌀", target: { step: "mount", field: "bossDiameterMm" } },
      relatesTo: { step: "mount" },
    });
  }

  // ---- Thickness ----
  // Board thickness is a documented board MEASUREMENT (useful for screw length and assembly
  // planning); the bracket sits under the board, so it does NOT enter the bracket geometry and
  // never blocks generation (reviewer #3). It is recorded for provenance, not consumed as a cut.
  if (!isKnown(board.thicknessMm)) {
    out.push({
      id: "thickness-unknown",
      severity: "warning",
      title: "Board thickness not measured",
      body: "Recorded for assembly/screw-length planning; it does not affect the generated bracket. Enter it when known.",
      fix: { label: "Enter thickness", target: { step: "measurements", field: "thicknessMm" } },
      relatesTo: { step: "measurements" },
    });
  } else if (!(board.thicknessMm.value > 0)) {
    out.push({
      id: "thickness-nonpositive",
      severity: "warning",
      title: "Board thickness must be positive",
      body: "A zero or negative board thickness is not physical. It does not block the bracket, but fix the measurement.",
      fix: { label: "Fix thickness", target: { step: "measurements", field: "thicknessMm" } },
      relatesTo: { step: "measurements" },
    });
  }

  // ---- Generation freshness (proven, not trusted) ----
  // Once the model is generatable, require a CURRENT generation before export. This is
  // recomputed from the model, so a persisted flag can never mark a stale model current.
  const generatable = summarize(out).errors === 0;
  if (generatable && !isGenerationCurrent(project)) {
    // Distinguish a genuine CODED failure (e.g. KEEPOUT_BLOCKED, MISSING_TOLERANCE) from a
    // model that is merely stale or not yet generated (reviewer #2), reading the keyed build
    // status the store produced off-thread — validation itself never runs the kernel
    // (reviewer #1). When the build is still in flight or unavailable, we fall through to the
    // stale/not-generated finding; once the coded failure lands in the cache it surfaces here,
    // where the preview, the export blocker, and the Copy-report all read.
    if (build && !build.ok && build.error.code !== "ABORTED") {
      out.push({
        id: "generation-failed",
        severity: "error",
        title: `Bracket cannot be generated (${build.error.code})`,
        body: build.error.feature ? `${build.error.message} (${build.error.feature})` : build.error.message,
        fix: { label: "Fix inputs", target: { step: "mount" } },
        relatesTo: { step: "mount" },
      });
    } else {
      out.push({
        id: "generation-stale",
        severity: "error",
        title: project.generated ? "Generated model is out of date" : "Mount not generated yet",
        body: project.generated
          ? "The bracket was generated from an earlier version of the model. Regenerate before exporting."
          : "Generate the bracket from the current model before exporting.",
        fix: { label: "Regenerate", target: { step: "mount" } },
        relatesTo: { step: "mount" },
      });
    }
  }

  // ---- Generation warnings ----
  // Surface the recorded warnings ONLY when the generation is CURRENT for the present model
  // (proven by key, not trusted). A stale generation's warnings describe an earlier model, so
  // echoing them here would misdescribe the current one — the "generation-stale" error already
  // tells the user to regenerate, and the live preview shows the current model's warnings. Key by
  // a stable digest of the warning text (not its index), so an edit that reorders/removes warnings
  // never lets a later warning inherit an earlier one's identity.
  if (project.generated && isGenerationCurrent(project)) {
    for (const w of project.generated.warnings) {
      out.push({
        id: `gen-warn-${warningKey(w)}`,
        severity: "warning",
        title: w,
        body: "From the current generation. Preview reflects it; consider adjusting the semantic model.",
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

/** Stable short digest of a warning string, so a validation id names the WARNING, not its list
 *  position — reordering or removing an earlier warning never reassigns a later one's identity. */
function warningKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
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

function requirePositive(
  out: Validation[],
  val: Val<number>,
  opts: { id: string; label: string; body: string; step: StepId; field: string },
): void {
  if (!isKnown(val)) {
    out.push({
      id: `${opts.id}-unknown`,
      severity: "error",
      title: `${opts.label} not set`,
      body: `${opts.body} Enter ${opts.label.toLowerCase()}, or the mount can't be generated.`,
      fix: { label: `Set ${opts.label.toLowerCase()}`, target: { step: opts.step, field: opts.field } },
      relatesTo: { step: opts.step },
    });
  } else if (!(val.value > 0)) {
    out.push({
      id: `${opts.id}-nonpositive`,
      severity: "error",
      title: `${opts.label} must be positive`,
      body: `A zero or negative ${opts.label.toLowerCase()} is not valid.`,
      fix: { label: `Fix ${opts.label.toLowerCase()}`, target: { step: opts.step, field: opts.field } },
      relatesTo: { step: opts.step },
    });
  }
}

/** Structural validity of a keep-out's shape-specific payload; null when valid. */
function keepOutShapeError(k: KeepOut): string | null {
  if (k.shape === "rect") {
    if (!k.rectPx) return "Rectangle geometry is missing.";
    if (!(k.rectPx.w > 0) || !(k.rectPx.h > 0)) return "Rectangle width and height must be positive.";
    return null;
  }
  if (k.shape === "circle") {
    if (!k.circlePx) return "Circle geometry is missing.";
    if (!(k.circlePx.radiusPx > 0)) return "Circle radius must be positive.";
    return null;
  }
  if (k.shape === "polygon") {
    if (!k.polygonPx || k.polygonPx.length < 3) return "A polygon needs at least three vertices.";
    return null;
  }
  return null;
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

/**
 * Export writes only trustworthy geometry: zero blocking errors AND a generation that
 * is CURRENT for the present model (recomputed, not a trusted flag). Because missing
 * outline/holes and a stale/absent generation are themselves blocking errors,
 * `blockers` is never empty while `ready` is false.
 */
export function exportReadiness(project: Project, items?: Validation[], build?: MeshResult): ExportReadiness {
  const list = items ?? validateProject(project, build);
  const blockers = blockingErrors(list);
  const isCalibrated =
    !!project.calibration && project.calibration.status === "valid" && project.calibration.pxPerMm != null;
  const generationCurrent = isGenerationCurrent(project);
  const checklist: string[] = [];
  if (isCalibrated) checklist.push(`Calibrated ${project.calibration!.pxPerMm!.toFixed(1)} px/mm`);
  if (project.board.outline?.confirmed)
    checklist.push(`Outline and ${project.board.holes.length} holes captured`);
  if (isKnown(project.board.thicknessMm) && project.board.thicknessMm.value > 0)
    checklist.push(
      `Board thickness measured · ${fmtLen(project.board.thicknessMm.value, project.units)} ${unitLabel(project.units)}`,
    );
  if (generationCurrent && project.generated) {
    // These are general generation warnings (e.g. inferred fabrication dimensions), NOT
    // "clipped standoff seats" — keep-outs are now enforced constraints that either resolve
    // cleanly or block the build, so the old label misdescribed what the count means.
    const n = project.generated.warnings.length;
    checklist.push(n === 0 ? "Generated bracket with no warnings" : `Generated bracket with ${n} warning${n === 1 ? "" : "s"} (see warnings)`);
  }
  const summary = summarize(list);
  checklist.push(`${summary.errors} errors · ${summary.warnings} warnings · model v${project.version}`);
  return { ready: blockers.length === 0 && isCalibrated && generationCurrent, blockers, checklist };
}
