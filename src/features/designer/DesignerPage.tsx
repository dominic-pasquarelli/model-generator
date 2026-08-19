import { useEffect, useMemo } from "react";
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
  const downloadProjectFile = useStore((s) => s.downloadProjectFile);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

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
      <SaveStateIndicator />
      <div className="vdiv" />
      <IconButton icon="undo" label="Undo" disabled={!canUndo} onClick={undo} />
      <IconButton icon="redo" label="Redo" disabled={!canRedo} onClick={redo} />
      <div className="vdiv" />
      <IconButton icon="save" label="Download project file (.mgproj)" onClick={() => downloadProjectFile()} />
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
