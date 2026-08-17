import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";
import { Chip, StateChip } from "@/components/ui/Chip";
import type { Project } from "@/core/project/types";
import { fmt, fmtInt } from "@/lib/format";
import { useStore, type ToolId } from "@/state/store";

interface ToolSpec {
  id: ToolId;
  icon: IconName;
  label: string;
  needsReference?: boolean;
}

const TOOLS: ToolSpec[][] = [
  [
    { id: "select", icon: "cursor", label: "Select" },
    { id: "pan", icon: "hand", label: "Pan" },
  ],
  [
    { id: "calibrate", icon: "ruler-plain", label: "Calibrate", needsReference: true },
    { id: "outline", icon: "polygon", label: "Draw outline", needsReference: true },
    { id: "hole", icon: "hole", label: "Place hole", needsReference: true },
    { id: "keepout", icon: "keepout", label: "Draw keep-out", needsReference: true },
  ],
];

const TOOL_STATUS_ICON: Record<ToolId, IconName> = {
  select: "cursor",
  pan: "hand",
  calibrate: "ruler-plain",
  outline: "polygon",
  hole: "hole",
  keepout: "keepout",
};

const TOOL_STATUS_LABEL: Record<ToolId, string> = {
  select: "Select",
  pan: "Pan",
  calibrate: "Calibrate",
  outline: "Draw outline",
  hole: "Place hole",
  keepout: "Keep-out rect",
};

export function CanvasToolbar({ project }: { project: Project }) {
  const activeTool = useStore((s) => s.ui.activeTool);
  const setTool = useStore((s) => s.setTool);
  const openCalibration = useStore((s) => s.openCalibration);
  const hasRef = !!project.reference;

  const pick = (id: ToolId) => {
    if (id === "calibrate") openCalibration();
    else setTool(id);
  };

  return (
    <div className="cv-tools" role="toolbar" aria-label="Canvas tools">
      {TOOLS.map((group, gi) => (
        <div key={gi} style={{ display: "contents" }}>
          {gi > 0 ? <div className="tdiv" /> : null}
          {group.map((t) => {
            const disabled = t.needsReference && !hasRef;
            return (
              <button
                key={t.id}
                className={cn("tool", activeTool === t.id && "is-active", disabled && "is-unavailable")}
                aria-label={t.label}
                aria-pressed={activeTool === t.id}
                title={t.label}
                disabled={disabled}
                onClick={() => pick(t.id)}
              >
                <Icon name={t.icon} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ZoomControl() {
  const zoom = useStore((s) => s.ui.zoom);
  const nudgeZoom = useStore((s) => s.nudgeZoom);
  const setZoom = useStore((s) => s.setZoom);
  return (
    <div className="cv-zoom" role="group" aria-label="Zoom">
      <button className="zbtn" aria-label="Zoom out" onClick={() => nudgeZoom(-0.1)}>
        <Icon name="minus" className="ic-sm" />
      </button>
      <div className="zval num">{Math.round(zoom * 100)}%</div>
      <button className="zbtn" aria-label="Zoom in" onClick={() => nudgeZoom(0.1)}>
        <Icon name="plus" className="ic-sm" />
      </button>
      <button className="zbtn" aria-label="Fit to view" onClick={() => setZoom(1)}>
        <Icon name="fit" className="ic-sm" />
      </button>
    </div>
  );
}

export function StatusBar({ project }: { project: Project }) {
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.ui.zoom);
  const tool = useStore((s) => s.ui.activeTool);
  const calibrated = project.calibration?.status === "valid" && project.calibration.pxPerMm != null;
  const generated = !!project.generated;

  // Cursor readout in board mm requires the calibration transform + outline origin.
  const frameOrigin = project.board.outline ? { x: Math.min(...project.board.outline.vertices.map((v) => v.x)), y: Math.min(...project.board.outline.vertices.map((v) => v.y)) } : null;
  let mmX: number | null = null;
  let mmY: number | null = null;
  if (cursor && calibrated && frameOrigin) {
    const pxPerMm = project.calibration!.pxPerMm!;
    mmX = (cursor.x - frameOrigin.x) / pxPerMm;
    mmY = (cursor.y - frameOrigin.y) / pxPerMm;
  }
  return (
    <div className="statusbar">
      <div className="grp">
        <Icon name={TOOL_STATUS_ICON[tool]} />
        <span>{TOOL_STATUS_LABEL[tool]}</span>
      </div>
      <div className="sdiv" />
      <div className="grp">
        <span>x</span>
        {mmX != null ? (
          <span className="val">{fmt(mmX)} mm</span>
        ) : (
          <span className="muted-val">{cursor ? `${fmtInt(cursor.x)} px` : "—"}</span>
        )}
        <span>y</span>
        {mmY != null ? (
          <span className="val">{fmt(mmY)} mm</span>
        ) : (
          <span className="muted-val">{cursor ? `${fmtInt(cursor.y)} px` : "—"}</span>
        )}
      </div>
      {!calibrated ? (
        <div className="grp">
          <span>mm</span>
          <span className="muted-val">{project.reference ? "— calibrate to see" : "— (no reference)"}</span>
        </div>
      ) : null}
      <div className="spacer" />
      <div className="grp">
        {calibrated ? (
          <StateChip state="measured" label={`Calibrated ${project.calibration!.pxPerMm!.toFixed(1)} px/mm`} />
        ) : (
          <StateChip state="uncalibrated" />
        )}
      </div>
      {generated ? (
        <>
          <div className="sdiv" />
          <div className="grp">
            <Chip tone="generated" icon="cube-flat">
              Generated
            </Chip>
          </div>
        </>
      ) : null}
      <div className="sdiv" />
      <div className="grp">
        <span>Zoom</span>
        <span className="val">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
