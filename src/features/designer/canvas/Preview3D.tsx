import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { Project } from "@/core/project/types";
import { clock } from "@/lib/format";
import { fmtLen, unitLabel } from "@/core/units/units";
import { useStore, type DesignerUi } from "@/state/store";
import { MeshView3D } from "./MeshView3D";
import { previewModel } from "./previewModel";
import { useLiveBuild } from "./useLiveBuild";

const VIEWS: DesignerUi["view3d"][] = ["iso", "top", "front", "fit"];
const VIEW_LABEL: Record<DesignerUi["view3d"], string> = { iso: "Iso", top: "Top", front: "Front", fit: "Fit" };

/**
 * 3D preview. The rendered mesh, the dimension pills, and the warning pill all come from
 * ONE live build of the current canonical model (reviewer #5): we never pair a live mesh
 * with stale stored dimensions. A separate provenance chip states whether that build IS
 * the recorded generation ("Generated") or an unrecorded edit ("Live draft"). The exporter
 * consumes the same solid path, so what you see is what serialises.
 */
export function Preview3D({ project }: { project: Project }) {
  const view3d = useStore((s) => s.ui.view3d);
  const setView3d = useStore((s) => s.setView3d);
  const autoGenerate = useStore((s) => s.ui.autoGenerate);
  const toggleAuto = useStore((s) => s.toggleAuto);
  const generate = useStore((s) => s.generate);

  const build = useLiveBuild(project);
  const preview = useMemo(() => previewModel(project, build), [project, build]);
  const liveWarning = preview.ok ? preview.warnings[0] : undefined;

  return (
    <div className="pane3d">
      <div className="pane-tag">
        <Icon name="cube" />
        3D preview · derived from canonical model
      </div>
      <div className="viewseg" role="group" aria-label="3D view">
        {VIEWS.map((v) => (
          <button key={v} className={cn(v === view3d && "is-on")} aria-pressed={v === view3d} onClick={() => setView3d(v)}>
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {preview.ok ? (
        <>
          <MeshView3D mesh={preview.mesh} view={view3d} />
          <div className="cv-pill" style={{ right: 14, top: 118 }}>
            <b>Bracket</b>·{fmtLen(preview.dims.widthMm, project.units)} × {fmtLen(preview.dims.depthMm, project.units)} × {fmtLen(preview.dims.heightMm, project.units)} {unitLabel(project.units)}
          </div>
          <div className="cv-pill" style={{ right: 14, top: 152 }}>
            {preview.dims.standoffCount} standoffs · {preview.dims.bodies} {preview.dims.bodies === 1 ? "body" : "bodies"} · {preview.dims.triangles.toLocaleString()} △
          </div>
          {liveWarning ? (
            <div className="cv-pill" style={{ left: 16, bottom: 92, background: "#332809cc", borderColor: "#8f6d24", color: "#f5d78e" }}>
              <Icon name="triangle" />
              {liveWarning}
            </div>
          ) : null}
          <div className="cv-pill" style={{ left: 16, bottom: 58 }}>
            {preview.provenance === "generated" ? (
              <>
                <Chip tone="generated" icon="cube-flat">
                  Generated
                </Chip>
                {preview.recordedAt != null ? clock(preview.recordedAt) : ""} · {preview.recordedDurationMs != null ? `${(preview.recordedDurationMs / 1000).toFixed(1)} s · ` : ""}deterministic
              </>
            ) : (
              <>
                <Chip tone="neutral" icon="cube">
                  Live draft
                </Chip>
                {preview.hasPriorGeneration ? "edited since last generate" : "not generated yet"} · regenerate to record
              </>
            )}
          </div>
          <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex", gap: 8, zIndex: 16 }}>
            <Button variant="dark" size="sm" icon="undo" onClick={() => generate()}>
              Regenerate
            </Button>
            <Button variant="ghost" size="sm" style={{ color: "#97a4b5" }} onClick={toggleAuto}>
              Auto: {autoGenerate ? "on" : "off"}
            </Button>
          </div>
        </>
      ) : preview.pending ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#7c8798",
            fontSize: 12.5,
            textAlign: "center",
            padding: 40,
          }}
        >
          Building the bracket off the main thread…
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#7c8798",
            fontSize: 12.5,
            textAlign: "center",
            padding: 40,
          }}
        >
          <span className="mono" style={{ color: "#c98b8b" }}>{preview.code}</span>
          {preview.feature ? ` · ${preview.feature}` : ""}
          <br />
          {preview.message} Resolve the blocking inputs, then the bracket generates from the canonical model.
        </div>
      )}
    </div>
  );
}
