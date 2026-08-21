import { Button } from "@/components/ui/Button";
import { Chip, StateChip } from "@/components/ui/Chip";
import { Checkbox } from "@/components/ui/fields";
import { ProgressBar } from "@/components/ui/feedback";
import { Dialog, Spacer } from "@/components/ui/overlay";
import { BlockerRow, ErrorReportBox, FileBox, MetaGrid, RadioCard, ReadyRow } from "@/components/ui/data";
import { Icon } from "@/icons/Icon";
import type { Project } from "@/core/project/types";
import { exportReadiness } from "@/core/validation/validate";
import { exportFileName } from "@/core/export/exporter";
import { inferredFabricationDims } from "@/core/project/derive";
import { fmtLen, unitLabel } from "@/core/units/units";
import { hashLabel } from "@/lib/format";
import { downloadArtifact, useStore } from "@/state/store";

export function ExportDialog({ project }: { project: Project }) {
  const ex = useStore((s) => s.ui.export);
  const closeExport = useStore((s) => s.closeExport);
  const setFormat = useStore((s) => s.setExportFormat);
  const toggleSidecar = useStore((s) => s.toggleSidecar);
  const runExport = useStore((s) => s.runExport);
  const cancelExport = useStore((s) => s.cancelExport);
  const retryExport = useStore((s) => s.retryExport);
  const commitExportDownload = useStore((s) => s.commitExportDownload);
  const toggleAckInferred = useStore((s) => s.toggleAckInferred);
  const setStep = useStore((s) => s.setStep);

  // Closing the export dialog returns the user to the synchronized preview.
  const dismiss = () => {
    closeExport();
    setStep("mount");
  };

  const readiness = exportReadiness(project);
  const fileName = exportFileName(project, ex.format);
  const paramsHash = project.generated?.paramsHash;
  const inferredDims = inferredFabricationDims(project);
  const genWarnings = project.generated?.warnings ?? [];
  // Export honesty policy (reviewer #5C): inferred fabrication dimensions ARE exported, so the
  // user must explicitly acknowledge them first. Measured-only models need no acknowledgement.
  const needsAck = inferredDims.length > 0;
  const canExport = readiness.ready && (!needsAck || ex.acknowledgedInferred);

  // ----- progress -----
  if (ex.phase === "progress") {
    return (
      <Dialog
        open
        onClose={cancelExport}
        title={`Generating ${ex.format.toUpperCase()}…`}
        icon="cube"
        headRight={<Chip tone="neutral">{ex.progress}%</Chip>}
        width={520}
        footer={
          <>
            <Spacer />
            <Button size="sm" onClick={cancelExport}>
              Cancel
            </Button>
          </>
        }
      >
        <ProgressBar value={ex.progress} label="Export progress" />
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
          {ex.stage}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)" }}>
          Long generations show progress and stay cancellable. Cancelling keeps the last good result and changes nothing
          on disk.
        </div>
      </Dialog>
    );
  }

  // ----- failed -----
  if (ex.phase === "failed") {
    return (
      <Dialog
        open
        onClose={dismiss}
        title={`${ex.format.toUpperCase()} export failed`}
        icon="x-circle"
        width={520}
        footer={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(`${ex.errorCode ?? ""}\n${ex.errorDetail ?? ""}`.trim())}
            >
              Copy report
            </Button>
            <Spacer />
            <Button size="sm" variant="primary" onClick={retryExport}>
              Retry
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>
          The readiness gate failed, so no file was written.
        </div>
        <ErrorReportBox>
          {ex.errorCode}
          <br />
          {ex.errorDetail}
        </ErrorReportBox>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>
          The canonical model is unchanged. This is diagnosable — the report names the cause instead of inventing
          geometry.
        </div>
      </Dialog>
    );
  }

  // ----- complete -----
  if (ex.phase === "complete" && ex.artifact) {
    const meta = ex.artifact.metadata;
    return (
      <Dialog
        open
        onClose={dismiss}
        title="Artifact prepared"
        icon="check"
        headRight={<Chip tone="neutral">Prepared</Chip>}
        width={520}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Close
            </Button>
            <Spacer />
            <Button
              size="sm"
              variant="primary"
              icon="export"
              onClick={() => {
                // Record the export in history ONLY when the download is actually initiated.
                commitExportDownload();
                downloadArtifact(ex.artifact!);
              }}
            >
              Download files
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>
          Prepared in memory. Download to write the files — nothing is recorded as exported until you do.
        </div>
        <FileBox
          icon="file"
          name={ex.artifact.fileName}
          right={<span style={{ fontSize: 11, color: "var(--text-3)" }}>{ex.artifact.record.sizeBytes} B</span>}
        />
        <MetaGrid
          rows={[
            { dt: "Units", dd: <>{meta.geometryUnits} geometry · {meta.displayUnits} display</> },
            { dt: "Schema", dd: <>v{meta.schemaVersion} · params <span className="mono">{hashLabel(meta.paramsHash ?? "—")}</span></> },
            { dt: "Sidecar", dd: <span className="mono">{ex.artifact.sidecar ? fileName.replace(/\.(step|stl)$/, ".meta.json") : "—"}</span> },
          ]}
        />
        <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "center" }}>
          <StateChip state="uncalibrated" label="Not physically verified" />
          <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>print + fit check is the real proof</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--warn)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <Icon name="triangle" style={{ width: 13, height: 13, marginTop: 1 }} />
          <span>{meta.note}</span>
        </div>
      </Dialog>
    );
  }

  // ----- idle: ready or blocked -----
  const ready = readiness.ready;
  return (
    <Dialog
      open
      onClose={dismiss}
      title="Export mount"
      icon="export"
      headRight={ready ? <StateChip state="confirmed" label="Ready" /> : <Chip tone="missing">{readiness.blockers.length} blockers</Chip>}
      width={560}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Cancel
          </Button>
          <Spacer />
          <Button size="sm" variant="primary" icon="export" disabled={!canExport} onClick={runExport}>
            Export {ex.format.toUpperCase()}
          </Button>
        </>
      }
    >
      {ready ? (
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1 }}>
            <div className="insp-title" style={{ marginBottom: 6 }}>
              Readiness
            </div>
            {readiness.checklist.map((c, i) => (
              <ReadyRow key={i}>{c}</ReadyRow>
            ))}
          </div>
          <div style={{ width: 190, borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
            <div className="insp-title" style={{ marginBottom: 6 }}>
              Will be recorded
            </div>
            <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
              Geometry <b>mm</b> · display <b>{project.units}</b>
              <br />
              Schema <b>v{project.schemaVersion}</b>
              <br />
              Params <span className="mono">{hashLabel(paramsHash ?? "—")}</span>
              <br />
              Generator <b>{project.generatorVersion}</b>
            </div>
          </div>
        </div>
      ) : null}

      {ready && genWarnings.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div className="insp-title" style={{ marginBottom: 6 }}>
            Generation warnings ({genWarnings.length})
          </div>
          {genWarnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--warn)", display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
              <Icon name="triangle" style={{ width: 12, height: 12, marginTop: 1 }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}

      {ready && needsAck ? (
        <div style={{ marginTop: 12, border: "1px solid var(--warn)", borderRadius: 8, padding: "10px 12px", background: "var(--warn-bg, #2a220c)" }}>
          <div className="insp-title" style={{ marginBottom: 6 }}>
            Inferred fabrication dimensions ({inferredDims.length})
          </div>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>
            These values were <b>inferred</b> as sensible defaults, not measured or confirmed. They will be exported. (No
            dimension is <b>Unknown</b> — those block export entirely.)
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.9 }}>
            {inferredDims.map((d) => (
              <div key={d.label}>
                <span className="mono" style={{ color: "var(--warn)" }}>
                  inferred
                </span>{" "}
                {d.label}: <b>{fmtLen(d.valueMm, project.units)}</b> {unitLabel(project.units)}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Checkbox
              checked={ex.acknowledgedInferred}
              onChange={toggleAckInferred}
              label={<>I understand these fabrication dimensions are inferred defaults, and choose to export them.</>}
            />
          </div>
        </div>
      ) : null}

      {!ready ? (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 9 }}>
            Export writes only trustworthy geometry. Resolve these first:
          </div>
          {readiness.blockers.map((b) => (
            <BlockerRow
              key={b.id}
              title={b.title}
              body={b.body}
              fix={
                b.fix ? (
                  <button className="vfix" onClick={() => (closeExport(), setStep(b.fix!.target.step ?? "reference"))}>
                    {b.fix.label}
                  </button>
                ) : null
              }
            />
          ))}
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
            Unknown dimensions block export. Inferred defaults are exported only after you acknowledge them.
          </div>
        </div>
      ) : null}

      <div className="hr" />
      <div className="insp-title" style={{ marginBottom: 8 }}>
        Format
      </div>
      <div className="fmt">
        <RadioCard
          selected={ex.format === "step"}
          name="STEP"
          ext=".step"
          desc="Real faceted B-rep solid (ISO-10303-21 AP214 structure). Curved walls are facets, not analytic surfaces; validated against internal properties, not an independent kernel; Fusion import is not yet verified."
          onSelect={() => setFormat("step")}
        />
        <RadioCard
          selected={ex.format === "stl"}
          name="STL"
          ext=".stl"
          desc="Generated ASCII STL mesh of the watertight solid; downstream slicer compatibility is not yet verified."
          onSelect={() => setFormat("stl")}
        />
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 10, fontSize: 11, color: "var(--info)", alignItems: "flex-start" }}>
        <Icon name="info" style={{ width: 13, height: 13, marginTop: 1 }} />
        <div>
          Real geometry from the canonical model, with a full parameter sidecar. STEP is a faceted B-rep and STL a
          watertight mesh — both host-level verified against internal properties, not an independent CAD kernel or
          slicer. Autodesk Fusion import and printed-part fit are not yet verified (the deferred evidence gate, ADR 0006).
        </div>
      </div>
      <div className="fgrid" style={{ marginTop: 12 }}>
        <div className="field span2">
          <label>File name</label>
          <div className="control">
            <span className="val mono">{fileName}</span>
          </div>
        </div>
      </div>
      <Checkbox
        checked={ex.writeSidecar}
        onChange={toggleSidecar}
        label={
          <>
            Write metadata sidecar (<span className="mono">.json</span>) — parameters, schema version, calibration
            provenance, warnings
          </>
        }
      />
    </Dialog>
  );
}
