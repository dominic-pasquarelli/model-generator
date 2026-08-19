import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberField, SelectField, Field } from "@/components/ui/fields";
import { Popover, Spacer } from "@/components/ui/overlay";
import type { CalibrationSourceKind, Project } from "@/core/project/types";
import { isKnown } from "@/core/project/value";
import { assessCalibration } from "@/core/units/units";
import { fmtInt } from "@/lib/format";
import { useStore } from "@/state/store";

const SOURCES: { value: CalibrationSourceKind; label: string }[] = [
  { value: "calipers", label: "Calipers — hole-to-hole centers" },
  { value: "datasheet", label: "Datasheet dimension" },
  { value: "ruler-in-photo", label: "Ruler in the photo" },
  { value: "known-feature", label: "Known feature size" },
  { value: "other", label: "Other" },
];

export function CalibrationPopover({ project }: { project: Project }) {
  const applyCalibration = useStore((s) => s.applyCalibration);
  const closeCalibration = useStore((s) => s.closeCalibration);
  const draft = useStore((s) => s.ui.calibDraft);

  // The popover only opens once two endpoints are placed (or seeded from an existing
  // calibration). Anchors come from those placed points — never hard-coded defaults.
  const anchors: [{ x: number; y: number }, { x: number; y: number }] =
    draft.length >= 2 ? [draft[0], draft[1]] : [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const priorMm = project.calibration && isKnown(project.calibration.knownMm) ? project.calibration.knownMm.value : null;

  const [knownMm, setKnownMm] = useState<number | null>(priorMm);
  const [source, setSource] = useState<CalibrationSourceKind>(project.calibration?.source ?? "calipers");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const assessment = useMemo(
    () => (knownMm == null ? null : assessCalibration(anchors[0], anchors[1], knownMm)),
    [knownMm, anchors],
  );
  const pixelDistance = Math.round(Math.hypot(anchors[1].x - anchors[0].x, anchors[1].y - anchors[0].y));
  const invalid = assessment != null && !assessment.valid;

  const help = applyMsg
    ? applyMsg
    : !assessment
      ? `Image length: ${fmtInt(pixelDistance)} px · enter the real distance between A and B`
      : assessment.valid
        ? `Image length: ${fmtInt(pixelDistance)} px → scale would be ${assessment.pxPerMm!.toFixed(1)} px/mm`
        : assessment.message;
  const showInvalid = invalid || applyMsg != null;

  return (
    <Popover
      title="Calibrate A – B"
      icon={showInvalid ? "alert-circle" : "ruler-plain"}
      headRight={showInvalid ? <Chip tone="missing">Invalid</Chip> : <Chip tone="uncal">Uncalibrated</Chip>}
      width={330}
      style={{ left: "38%", top: 180 }}
      onClose={closeCalibration}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={closeCalibration}>
            Cancel
          </Button>
          <Spacer />
          {assessment?.suggestedMm ? (
            <Button size="sm" onClick={() => setKnownMm(Number(assessment.suggestedMm!.toFixed(2)))}>
              Use {assessment.suggestedMm.toFixed(2)} mm
            </Button>
          ) : (
            <Button size="sm" disabled title="Two lines catch photo skew (planned)">
              + Second line
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={knownMm == null || invalid}
            onClick={() => {
              if (knownMm == null) return;
              const res = applyCalibration(knownMm, source);
              setApplyMsg(res.ok ? null : res.message ?? "Calibration rejected.");
            }}
          >
            Apply calibration
          </Button>
        </>
      }
    >
      <div className="fgrid">
        <NumberField
          span2
          label="Known distance between A and B"
          value={knownMm}
          onCommit={(v) => {
            setKnownMm(v);
            setApplyMsg(null);
          }}
          unit="mm"
          min={0}
          invalid={showInvalid}
          help={help}
          helpError={showInvalid}
        />
        <Field span2 label="Measurement source" help="Provenance is saved with the calibration. A datasheet dimension beats a ruler in the photo.">
          <SelectField ariaLabel="Measurement source" value={source} options={SOURCES} onChange={setSource} />
        </Field>
      </div>
    </Popover>
  );
}
