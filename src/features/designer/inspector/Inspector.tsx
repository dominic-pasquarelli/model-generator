import type { Project } from "@/core/project/types";
import type { FixTarget, Validation } from "@/core/validation/validate";
import { useStore } from "@/state/store";
import { ValidationPanel } from "./ValidationPanel";
import {
  BoardSection,
  CalibrationSection,
  ExportSections,
  HolesSection,
  KeepOutsSection,
  MeasurementsSection,
  MountSection,
  OutlineSection,
  ProjectSection,
  ReferenceSection,
} from "./sections";

function SectionsForStep({ project, step }: { project: Project; step: string }) {
  switch (step) {
    case "reference":
      return (
        <>
          <ProjectSection project={project} />
          <ReferenceSection project={project} />
          <BoardSection project={project} />
        </>
      );
    case "calibrate":
      return (
        <>
          <ReferenceSection project={project} />
          <CalibrationSection project={project} />
        </>
      );
    case "outline":
      return (
        <>
          <OutlineSection project={project} />
          <BoardSection project={project} />
        </>
      );
    case "holes":
      return <HolesSection project={project} />;
    case "keepouts":
      return <KeepOutsSection project={project} />;
    case "measurements":
      return (
        <>
          <MeasurementsSection project={project} />
          <BoardSection project={project} />
        </>
      );
    case "mount":
      return <MountSection project={project} />;
    case "export":
      return <ExportSections project={project} />;
    default:
      return null;
  }
}

export function Inspector({ project, validations }: { project: Project; validations: Validation[] }) {
  const step = useStore((s) => s.ui.activeStep);
  const setStep = useStore((s) => s.setStep);
  const select = useStore((s) => s.select);
  const openCalibration = useStore((s) => s.openCalibration);

  const onFix = (t: FixTarget) => {
    if (t.step) setStep(t.step);
    if (t.holeId) select({ kind: "hole", id: t.holeId });
    if (t.keepOutId) select({ kind: "keepout", id: t.keepOutId });
    if (t.step === "calibrate" || t.field === "knownMm") openCalibration();
  };

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-scroll">
        <SectionsForStep project={project} step={step} />
      </div>
      <ValidationPanel items={validations} onFix={onFix} />
    </aside>
  );
}
