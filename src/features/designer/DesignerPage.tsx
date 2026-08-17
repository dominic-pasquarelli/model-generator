import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SaveStateIndicator, ThemeToggle, TopBar } from "@/components/shell/TopBar";
import { validateProject } from "@/core/validation/validate";
import { exportReadiness } from "@/core/validation/validate";
import { useStore } from "@/state/store";
import { CanvasStage } from "./canvas/CanvasStage";
import { Inspector } from "./inspector/Inspector";
import { WorkflowRail } from "./WorkflowRail";
import { deriveStepStates, STEPS } from "./steps";

export function DesignerPage() {
  const project = useStore((s) => s.current);
  const activeStep = useStore((s) => s.ui.activeStep);
  const setStep = useStore((s) => s.setStep);
  const goLibrary = useStore((s) => s.goLibrary);
  const openExport = useStore((s) => s.openExport);

  const validations = useMemo(() => (project ? validateProject(project) : []), [project]);
  const stepStates = useMemo(
    () => (project ? deriveStepStates(project, validations, activeStep) : []),
    [project, validations, activeStep],
  );

  if (!project) return null;

  const readiness = exportReadiness(project, validations);
  const stepNote = STEPS.find((s) => s.id === activeStep)?.hint ?? "";

  const right = (
    <>
      <SaveStateIndicator savedAt={project.updatedAt} />
      <div className="vdiv" />
      <IconButton icon="undo" label="Undo" disabled />
      <IconButton icon="redo" label="Redo" disabled />
      <div className="vdiv" />
      <ThemeToggle />
      <Badge>{project.units}</Badge>
      <Button
        size="sm"
        variant={readiness.ready ? "primary" : "secondary"}
        icon="export"
        disabled={!readiness.ready}
        title={readiness.ready ? "Export the generated mount" : "Resolve blocking inputs to enable export"}
        onClick={openExport}
      >
        Export
      </Button>
    </>
  );

  return (
    <div className="frame">
      <TopBar
        crumbs={[
          { label: "Library", onClick: goLibrary },
          { label: project.name, current: true, chip: <Chip tone="neutral">Board Mount Designer</Chip> },
        ]}
        right={right}
      />
      <div className="main">
        <WorkflowRail steps={stepStates} note={stepNote} onSelect={setStep} onBack={goLibrary} />
        <CanvasStage project={project} />
        <Inspector project={project} validations={validations} />
      </div>
    </div>
  );
}
