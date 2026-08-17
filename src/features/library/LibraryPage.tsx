import { Icon } from "@/icons/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip, StateChip } from "@/components/ui/Chip";
import { TopBar, ThemeToggle } from "@/components/shell/TopBar";
import type { Project } from "@/core/project/types";
import { relativeTime } from "@/lib/format";
import { useStore } from "@/state/store";
import { ProjectThumb } from "./ProjectThumb";

function projectStatusChip(p: Project) {
  if (p.exports.length > 0) return <Chip tone="neutral">Exported</Chip>;
  if (p.generated) return <Chip tone="neutral">In progress</Chip>;
  if (p.calibration?.status === "valid") return <Chip tone="neutral">In progress</Chip>;
  return <Chip tone="neutral">Draft</Chip>;
}

function projectStateChip(p: Project) {
  if (p.generated) return <StateChip state="generated" />;
  if (p.calibration?.status === "valid")
    return <StateChip state="measured" label={`Calibrated`} />;
  return <StateChip state="uncalibrated" />;
}

function ProjectCard({ project }: { project: Project }) {
  const openProject = useStore((s) => s.openProject);
  const holes = project.board.holes.length;
  const kos = project.board.keepOuts.length;
  return (
    <button className="pcard" onClick={() => openProject(project.id)}>
      <div className="pthumb">
        <ProjectThumb project={project} />
      </div>
      <div className="pbody">
        <div className="pname">{project.name}</div>
        <div className="ptool">Board Mount Designer</div>
        <div className="pmeta">
          Edited {relativeTime(project.updatedAt)} · {holes} hole{holes === 1 ? "" : "s"}
          {kos > 0 ? ` · ${kos} keep-out${kos === 1 ? "" : "s"}` : ""}
        </div>
        <div className="pchips">
          {projectStatusChip(project)}
          {projectStateChip(project)}
        </div>
      </div>
    </button>
  );
}

function NewProjectCard() {
  const newProject = useStore((s) => s.newProject);
  return (
    <button className="pcard-new" onClick={() => newProject()}>
      <span className="plus">
        <Icon name="plus" />
      </span>
      <span className="t">New project</span>
      <span className="d">Start from a board photo or drawing</span>
    </button>
  );
}

export function LibraryPage() {
  const projects = useStore((s) => s.projects);
  const savedBoards = useStore((s) => s.savedBoards);
  const newProject = useStore((s) => s.newProject);
  const goStates = useStore((s) => s.goStates);

  const right = (
    <>
      <Badge icon="monitor">Local workspace — no account</Badge>
      <ThemeToggle />
      <IconButton icon="sliders" label="Required UI states" onClick={goStates} />
    </>
  );

  return (
    <div className="frame">
      <TopBar crumbs={[{ label: "Library", current: true }]} right={right} />
      <div className="content">
        <div className="container">
          <div className="pagehead">
            <div>
              <h1>Projects</h1>
              <div className="sub">Browser-local drafts on this device</div>
            </div>
            <div className="actions">
              <Button icon="folder" disabled title="Opening project files is planned — persistence is browser-local for now">
                Open project…
              </Button>
              <Button icon="plus" variant="primary" onClick={() => newProject()}>
                New project
              </Button>
            </div>
          </div>

          <div className="pcards">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            <NewProjectCard />
          </div>

          <div className="sechead">
            <h2>Tools</h2>
            <div className="sub">Focused workspaces — each one useful on its own</div>
          </div>
          <div className="tcards">
            <div className="tcard">
              <div className="ttile ttile-active">
                <Icon name="board" />
              </div>
              <div className="tbody">
                <div className="tname">
                  Board Mount Designer <StateChip state="confirmed" label="Available" />
                </div>
                <div className="tdesc">
                  Turn a board photo or drawing plus trusted measurements into a validated, reusable, exportable mount.
                </div>
                <div className="tacts">
                  <Button size="sm" variant="primary" onClick={() => newProject()}>
                    New Board Mount project
                  </Button>
                </div>
              </div>
            </div>
            <div className="tcard is-muted">
              <div className="ttile ttile-muted">
                <Icon name="assembly" />
              </div>
              <div className="tbody">
                <div className="tname">
                  Board Mount Assembly <Chip tone="neutral">Planned — future scope</Chip>
                </div>
                <div className="tdesc">
                  Compose saved board and mount definitions into larger structures — stacking, clearances, wire paths,
                  serviceability.
                </div>
                <div className="tacts">
                  <Button size="sm" disabled>
                    Not available yet
                  </Button>
                </div>
              </div>
            </div>
            <div className="tcard-ghost">
              The toolbox grows one proven tool at a time.
              <br />
              Reusable board definitions carry over.
            </div>
          </div>

          {savedBoards.length > 0 ? (
            <>
              <div className="sechead">
                <h2>Saved board definitions</h2>
                <div className="sub">Reusable across mount strategies · stored in this browser</div>
              </div>
              <div className="tcards" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {savedBoards.map((b) => (
                  <div key={b.id} className="tcard" style={{ display: "block" }}>
                    <div className="tname">
                      <Icon name="board" /> {b.name || "Untitled board"}
                      {b.revision ? <Chip tone="neutral">{b.revision}</Chip> : null}
                    </div>
                    <div className="tdesc">
                      {b.board.holes.length} hole{b.board.holes.length === 1 ? "" : "s"} · {b.board.keepOuts.length} keep-out
                      {b.board.keepOuts.length === 1 ? "" : "s"}
                      {b.calibration?.status === "valid" ? " · calibrated" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="localstrip">
            <Icon name="lock" />
            <div>
              <b>Local-first.</b> Projects are drafts stored in this browser (no server, account, sync, or upload).
              Durable project files are a planned step.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
