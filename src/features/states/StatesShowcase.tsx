import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/feedback";
import { BlockerRow, ErrorReportBox, FileBox, MetaGrid } from "@/components/ui/data";
import { TopBar, ThemeToggle } from "@/components/shell/TopBar";
import { useStore } from "@/state/store";

type HicTone = "warn" | "err" | "ok" | "run" | "inf";

function Cell({ num, label, children }: { num: number; label: string; children: ReactNode }) {
  return (
    <div className="cell">
      <div className="clabel">
        <span className="cnum">{num}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function Card({
  icon,
  tone,
  title,
  right,
  body,
  foot,
}: {
  icon: IconName;
  tone: HicTone;
  title: ReactNode;
  right?: ReactNode;
  body: ReactNode;
  foot: ReactNode;
}) {
  return (
    <div className="card">
      <div className="chead">
        <div className={cn("hic", `hic-${tone}`)}>
          <Icon name={icon} />
        </div>
        <div className="t">{title}</div>
        {right}
      </div>
      <div className="cbody">{body}</div>
      <div className="cfoot">{foot}</div>
    </div>
  );
}

/** The required-early-states sheet (mockup 09), rebuilt from live components. */
export function StatesShowcase() {
  const goLibrary = useStore((s) => s.goLibrary);
  return (
    <div className="frame">
      <TopBar
        crumbs={[
          { label: "Library", onClick: goLibrary },
          { label: "Required states", current: true },
        ]}
        right={
          <>
            <ThemeToggle />
            <Button size="sm" icon="chevron-left" onClick={goLibrary}>
              Back to Library
            </Button>
          </>
        }
      />
      <div className="content">
        <div className="container" style={{ width: "min(1360px, calc(100% - 64px))" }}>
          <div className="pagehead">
            <div>
              <h1 style={{ fontSize: 18 }}>Board Mount Designer — required early states</h1>
              <div className="sub">Blocked, busy, failed, and complete moments the workflow must cover.</div>
            </div>
            <div className="actions" style={{ alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginRight: 2 }}>
                State vocabulary
              </span>
              <Chip tone="uncal" icon="crosshair">Uncalibrated</Chip>
              <Chip tone="inferred" icon="approx">Inferred</Chip>
              <Chip tone="measured" icon="ruler">Measured</Chip>
              <Chip tone="confirmed" icon="check">Confirmed</Chip>
              <Chip tone="generated" icon="cube-flat">Generated</Chip>
              <Chip tone="neutral">Exported</Chip>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 22,
            }}
          >
            <Cell num={1} label="Reopened project · missing image">
              <Card
                icon="image-off"
                tone="warn"
                title="Reference image is missing"
                body={
                  <>
                    The saved reference can't be found at its last location.
                    <FileBox name="refs/mg-dev-01_top.jpg" icon="image" right={<Chip tone="missing">Not found</Chip>} />
                    Your board definition is intact — outline, holes, keep-outs, and calibration are stored in the
                    project, not the image.
                  </>
                }
                foot={
                  <>
                    <Button size="sm" variant="primary">Locate image…</Button>
                    <Button size="sm" variant="ghost">Continue without it</Button>
                  </>
                }
              />
            </Cell>

            <Cell num={2} label="Export blocked">
              <Card
                icon="export"
                tone="err"
                title="Export isn't ready"
                right={<Chip tone="missing">2 blockers</Chip>}
                body={
                  <>
                    Export writes only trustworthy geometry. Two inputs are still missing:
                    <div style={{ marginTop: 9 }}>
                      <BlockerRow title="Reference is uncalibrated" body="Pixels have no physical scale yet." fix={<span className="vfix">Calibrate</span>} />
                      <BlockerRow title="H3 has no diameter" body="Standoff and screw can't be sized." fix={<span className="vfix">Enter ⌀</span>} />
                    </div>
                  </>
                }
                foot={
                  <>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Nothing is exported with guessed values.</span>
                    <div className="spacer" />
                    <Button size="sm" variant="primary" disabled>Export</Button>
                  </>
                }
              />
            </Cell>

            <Cell num={3} label="Export in progress">
              <Card
                icon="cube"
                tone="run"
                title="Generating STEP…"
                right={<Chip tone="neutral">64%</Chip>}
                body={
                  <>
                    <ProgressBar value={64} label="Export progress" />
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
                      boolean: standoff 4 / 6 · 2.1 s elapsed
                    </div>
                    <div style={{ marginTop: 10 }}>
                      Long generations show progress and stay cancellable. Cancelling keeps the last good result and
                      changes nothing on disk.
                    </div>
                  </>
                }
                foot={
                  <>
                    <div className="spacer" />
                    <Button size="sm">Cancel</Button>
                  </>
                }
              />
            </Cell>

            <Cell num={4} label="Export failed">
              <Card
                icon="x-circle"
                tone="err"
                title="STEP export failed"
                body={
                  <>
                    The generated solid failed a validity check, so no file was written.
                    <ErrorReportBox>
                      GEOM_BOOLEAN_NON_MANIFOLD
                      <br />
                      standoff S2 ∩ base plate · seam 0.002 mm
                    </ErrorReportBox>
                    The canonical model is unchanged. This is diagnosable — the report names the failing feature and
                    parameters instead of inventing geometry.
                  </>
                }
                foot={
                  <>
                    <Button size="sm" variant="ghost">Copy report</Button>
                    <div className="spacer" />
                    <Button size="sm">Open log</Button>
                    <Button size="sm" variant="primary">Retry</Button>
                  </>
                }
              />
            </Cell>

            <Cell num={5} label="Export complete">
              <Card
                icon="check"
                tone="ok"
                title="Export complete"
                right={<Chip tone="neutral">Exported</Chip>}
                body={
                  <>
                    <FileBox name="cm4-carrier-mount-a_v15.step" right={<span style={{ fontSize: 11, color: "var(--text-3)" }}>412 KB</span>} />
                    <MetaGrid
                      rows={[
                        { dt: "Units", dd: "mm" },
                        { dt: "Schema", dd: <>v1 · params <span className="mono">a41c92…7f0e</span></> },
                        { dt: "Sidecar", dd: <span className="mono" style={{ fontWeight: 500 }}>…_v15.meta.json</span> },
                      ]}
                    />
                    <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "center" }}>
                      <Chip tone="uncal">Not physically verified</Chip>
                      <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>print + fit check is the real proof</span>
                    </div>
                  </>
                }
                foot={
                  <>
                    <Button size="sm" variant="ghost">Export STL too</Button>
                    <div className="spacer" />
                    <Button size="sm" variant="primary">Show in folder</Button>
                  </>
                }
              />
            </Cell>

            <Cell num={6} label="Reviewing an inferred value">
              <Card
                icon="approx"
                tone="inf"
                title="H4 position is inferred"
                right={<Chip tone="inferred" icon="approx">Inferred</Chip>}
                body={
                  <>
                    Suggested by mirroring the H1–H3 hole pattern — not measured from the board.
                    <MetaGrid
                      rows={[
                        { dt: "Suggested center", dd: <span className="num">(81.50, 52.50) mm</span> },
                        { dt: "Vs. photo click", dd: <span className="num">Δ 0.28 mm</span> },
                        { dt: "Source", dd: "Pattern symmetry" },
                      ]}
                    />
                    <div style={{ marginTop: 10 }}>
                      Confirming marks it user-reviewed — it stays editable. Typing a caliper value upgrades it to
                      Measured.
                    </div>
                  </>
                }
                foot={
                  <>
                    <Button size="sm" variant="ghost">Adjust…</Button>
                    <div className="spacer" />
                    <Button size="sm">Type measured value</Button>
                    <Button size="sm" variant="primary">Confirm</Button>
                  </>
                }
              />
            </Cell>
          </div>
        </div>
      </div>
    </div>
  );
}
