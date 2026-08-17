import type { Project } from "@/core/project/types";
import { isKnown } from "@/core/project/value";
import type { StepId, Validation } from "@/core/validation/validate";

export interface StepDef {
  id: StepId;
  index: number;
  label: string;
  hint: string;
}

export const STEPS: StepDef[] = [
  { id: "reference", index: 1, label: "Reference", hint: "Add a board photo or drawing. It stays on this device." },
  { id: "calibrate", index: 2, label: "Calibrate", hint: "Turn pixels into millimetres from a distance you trust." },
  { id: "outline", index: 3, label: "Outline", hint: "Trace the board edge to give the plate a boundary." },
  { id: "holes", index: 4, label: "Holes", hint: "Place mounting holes; type the exact drill/screw size." },
  { id: "keepouts", index: 5, label: "Keep-outs", hint: "Reserve space for connectors, tall parts, service access." },
  { id: "measurements", index: 6, label: "Measurements", hint: "Enter values the image cannot safely supply." },
  { id: "mount", index: 7, label: "Mount", hint: "Choose a strategy; 2D and 3D show the same model." },
  { id: "export", index: 8, label: "Preview & export", hint: "Export exactly what was generated, with its parameters." },
];

export type StepStatus = "todo" | "current" | "done" | "blocked";

export interface StepState {
  def: StepDef;
  status: StepStatus;
  flag?: "err" | "warn";
  meta?: string;
  enabled: boolean;
}

function calibrated(p: Project): boolean {
  return !!p.calibration && p.calibration.status === "valid" && p.calibration.pxPerMm != null;
}

function holesComplete(p: Project): boolean {
  return p.board.holes.length > 0 && p.board.holes.every((h) => isKnown(h.diameterMm));
}

function stepEnabled(id: StepId, p: Project): boolean {
  switch (id) {
    case "reference":
      return true;
    case "calibrate":
    case "outline":
    case "holes":
    case "keepouts":
    case "measurements":
      return !!p.reference;
    case "mount":
    case "export":
      return calibrated(p) && !!p.board.outline && p.board.holes.length > 0;
  }
}

function stepDone(id: StepId, p: Project): boolean {
  switch (id) {
    case "reference":
      return !!p.reference && !p.reference.missing;
    case "calibrate":
      return calibrated(p);
    case "outline":
      return !!p.board.outline && p.board.outline.vertices.length >= 3;
    case "holes":
      return holesComplete(p);
    case "keepouts":
      return p.board.keepOuts.length > 0;
    case "measurements":
      return isKnown(p.board.thicknessMm);
    case "mount":
      return !!p.generated && p.generated.upToDate;
    case "export":
      return p.exports.length > 0;
  }
}

function stepMeta(id: StepId, p: Project): string | undefined {
  if (id === "calibrate" && calibrated(p)) return `${p.calibration!.pxPerMm!.toFixed(1)} px/mm`;
  if (id === "holes" && p.board.holes.length > 0)
    return holesComplete(p) ? `${p.board.holes.length} · ✓` : `${p.board.holes.length}`;
  if (id === "keepouts" && p.board.keepOuts.length > 0) return `${p.board.keepOuts.length}`;
  return undefined;
}

export function deriveStepStates(p: Project, validations: Validation[], activeStep: StepId): StepState[] {
  return STEPS.map((def) => {
    const related = validations.filter((v) => v.relatesTo?.step === def.id);
    const hasErr = related.some((v) => v.severity === "error");
    const hasWarn = related.some((v) => v.severity === "warning");
    const done = stepDone(def.id, p);
    let status: StepStatus = "todo";
    if (def.id === activeStep) status = hasErr ? "blocked" : "current";
    else if (done) status = "done";

    return {
      def,
      status,
      ...(hasErr ? { flag: "err" as const } : hasWarn ? { flag: "warn" as const } : {}),
      ...(stepMeta(def.id, p) ? { meta: stepMeta(def.id, p) } : {}),
      enabled: stepEnabled(def.id, p),
    };
  });
}
