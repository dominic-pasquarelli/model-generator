import { cn } from "@/lib/cn";
import { BRACKET_ISO_SRC } from "@/assets";
import { Icon } from "@/icons/Icon";
import { Kbd } from "@/components/ui/Badge";
import type { Project } from "@/core/project/types";
import { outlineDims } from "@/core/project/derive";
import { fmt } from "@/lib/format";
import { useStore } from "@/state/store";
import { CanvasToolbar, StatusBar, ZoomControl } from "./chrome";
import { EmptyState } from "./EmptyState";
import { Viewport2D } from "./Viewport2D";
import { Preview3D } from "./Preview3D";
import { CalibrationPopover } from "../dialogs/CalibrationPopover";
import { ExportDialog } from "../dialogs/ExportDialog";

type Mode = "empty" | "2d" | "split" | "export3d";

function modeFor(project: Project, step: string): Mode {
  if (!project.reference) return "empty";
  if (step === "export") return "export3d";
  if (step === "mount") return "split";
  return "2d";
}

function CanvasBanner({ project }: { project: Project }) {
  const cal = project.calibration;
  if (cal && cal.status === "invalid") {
    return (
      <div className="banner banner-err">
        <Icon name="alert-circle" />
        Calibration rejected — the entered distance implies an implausible scale
      </div>
    );
  }
  if (!cal || cal.status !== "valid") {
    return (
      <div className="banner banner-uncal">
        <Icon name="crosshair" />
        Uncalibrated reference — pixels are not millimetres yet
      </div>
    );
  }
  return null;
}

function ContextHint({ step }: { step: string }) {
  if (step === "holes")
    return (
      <div className="cv-hint" style={{ bottom: 12 }}>
        Click a pad center to place a hole · <Kbd>⇧</Kbd> snap · <Kbd>Enter</Kbd> type exact values
      </div>
    );
  if (step === "keepouts")
    return (
      <div className="cv-hint" style={{ bottom: 12 }}>
        Drag to draw a zone · heights are typed, not guessed
      </div>
    );
  if (step === "outline")
    return (
      <div className="cv-hint" style={{ bottom: 12 }}>
        Drag to trace the board edge · corners stay editable as numbers
      </div>
    );
  if (step === "calibrate")
    return (
      <div className="cv-hint" style={{ bottom: 12 }}>
        Enter a distance you trust between anchors A and B
      </div>
    );
  return null;
}

function ContextPill({ project, step }: { project: Project; step: string }) {
  const dims = outlineDims(project);
  if ((step === "holes" || step === "outline") && dims) {
    return (
      <div className="cv-pill" style={{ left: 20, bottom: 46 }}>
        <Icon name="square-outline" />
        Outline <b>{fmt(dims.widthMm)} × {fmt(dims.heightMm)} mm</b>
      </div>
    );
  }
  if (step === "keepouts" && project.board.keepOuts.length > 0) {
    return (
      <div className="cv-pill" style={{ left: 20, top: 20 }}>
        <Icon name="keepout" />
        {project.board.keepOuts.length} keep-outs · reserved volumes above the board
      </div>
    );
  }
  return null;
}

export function CanvasStage({ project }: { project: Project }) {
  const step = useStore((s) => s.ui.activeStep);
  const calibrationOpen = useStore((s) => s.ui.calibrationOpen);
  const mode = modeFor(project, step);

  return (
    <div className="canvas-wrap">
      <div
        className={cn("canvas", mode === "export3d" && "is-3d")}
        style={mode === "split" ? { background: "none" } : undefined}
      >
        {mode === "empty" ? (
          <>
            <CanvasToolbar project={project} />
            <EmptyState />
            <ZoomControl />
          </>
        ) : null}

        {mode === "2d" ? (
          <>
            <CanvasToolbar project={project} />
            <Viewport2D project={project} />
            {step === "calibrate" ? <CanvasBanner project={project} /> : null}
            <ContextPill project={project} step={step} />
            <ContextHint step={step} />
            <ZoomControl />
            {calibrationOpen ? <CalibrationPopover project={project} /> : null}
          </>
        ) : null}

        {mode === "split" ? (
          <div className="split">
            <div className="pane2d">
              <div className="pane-tag">
                <Icon name="square-outline" />
                2D reference
              </div>
              <Viewport2D project={project} />
            </div>
            <Preview3D project={project} />
          </div>
        ) : null}

        {mode === "export3d" ? (
          <>
            <img
              src={BRACKET_ISO_SRC}
              alt="Illustrative generated bracket"
              style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)", width: 560, maxWidth: "70%", opacity: 0.95 }}
            />
            <ExportDialog project={project} />
          </>
        ) : null}
      </div>
      <StatusBar project={project} />
    </div>
  );
}
