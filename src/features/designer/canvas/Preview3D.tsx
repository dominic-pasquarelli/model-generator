import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { Project } from "@/core/project/types";
import { isGenerationCurrent } from "@/core/project/derive";
import { clock } from "@/lib/format";
import { fmtLen, unitLabel } from "@/core/units/units";
import { useStore, type DesignerUi } from "@/state/store";
import { MeshView3D } from "./MeshView3D";

const VIEWS: DesignerUi["view3d"][] = ["iso", "top", "front", "fit"];
const VIEW_LABEL: Record<DesignerUi["view3d"], string> = { iso: "Iso", top: "Top", front: "Front", fit: "Fit" };

/**
 * 3D preview. The bracket image is an ILLUSTRATION (no kernel yet); dimensions and
 * warnings shown come from the deterministic generator so preview reflects the
 * canonical model. "Derived from canonical model" is stated on the pane tag.
 */
export function Preview3D({ project }: { project: Project }) {
  const view3d = useStore((s) => s.ui.view3d);
  const setView3d = useStore((s) => s.setView3d);
  const autoGenerate = useStore((s) => s.ui.autoGenerate);
  const toggleAuto = useStore((s) => s.toggleAuto);
  const generate = useStore((s) => s.generate);
  const gen = project.generated;

  const clipWarning = gen?.warnings[0];

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

      {gen ? (
        <MeshView3D project={project} view={view3d} />
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
          Resolve the blocking inputs, then the bracket generates from the canonical model.
        </div>
      )}

      {gen ? (
        <>
          <div className="cv-pill" style={{ right: 14, top: 118 }}>
            <b>Bracket</b>·plate + standoffs · {fmtLen(gen.dims.widthMm, project.units)} × {fmtLen(gen.dims.depthMm, project.units)} × {fmtLen(gen.dims.heightMm, project.units)} {unitLabel(project.units)}
          </div>
          <div className="cv-pill" style={{ right: 14, top: 152 }}>
            {gen.dims.standoffCount} standoffs · {project.mount.fastener} · {gen.dims.bodies} bodies · {gen.dims.triangles.toLocaleString()} △
          </div>
          {clipWarning ? (
            <div className="cv-pill" style={{ left: 16, bottom: 92, background: "#332809cc", borderColor: "#8f6d24", color: "#f5d78e" }}>
              <Icon name="triangle" />
              {clipWarning}
            </div>
          ) : null}
          <div className="cv-pill" style={{ left: 16, bottom: 58 }}>
            <Chip tone="generated" icon="cube-flat">
              Generated
            </Chip>
            {clock(gen.createdAt)} · {gen.durationMs != null ? `${(gen.durationMs / 1000).toFixed(1)} s · ` : ""}deterministic
            {isGenerationCurrent(project) ? "" : " · stale"}
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
      ) : null}
    </div>
  );
}
