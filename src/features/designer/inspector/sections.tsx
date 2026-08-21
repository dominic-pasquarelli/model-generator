import { Button } from "@/components/ui/Button";
import { Chip, StateChip } from "@/components/ui/Chip";
import { Field, SegmentedControl, SelectField, TextInput } from "@/components/ui/fields";
import type { FastenerChoice, KeepOut, MountingHole, Project } from "@/core/project/types";
import { boardFrame, holeMm, isGenerationCurrent, outlineDims, rectMm } from "@/core/project/derive";
import { isKnown, maybe } from "@/core/project/value";
import { fmtLen, unitLabel, type Unit } from "@/core/units/units";
import { boardMmToImage, useStore } from "@/state/store";
import { InspectorSection, Muted, ObjectRow } from "./parts";
import { MmField } from "./MmField";

const FASTENERS: { value: FastenerChoice; label: string }[] = [
  { value: "M2", label: "M2" },
  { value: "M2.5", label: "M2.5" },
  { value: "M3", label: "M3" },
  { value: "M4", label: "M4" },
  { value: "custom", label: "Custom" },
];

function stateToChip(state: MountingHole["state"], missing: boolean) {
  if (missing) return <StateChip state="missing" label="Missing ⌀" />;
  if (state === "confirmed") return <StateChip state="confirmed" />;
  if (state === "inferred") return <StateChip state="inferred" />;
  return <StateChip state="measured" />;
}

export function ProjectSection({ project }: { project: Project }) {
  // Units are a DISPLAY concern only — the canonical model stays in millimetres and the
  // toggle just changes how values are shown and typed across the inspector and canvas.
  const setUnits = useStore((s) => s.setUnits);
  return (
    <InspectorSection icon="folder" title="Project">
      <div className="fgrid">
        <Field span2 label="Name">
          <div className="control">
            <span className="val">{project.name}</span>
          </div>
        </Field>
        <Field label="Units" help="Display only — the model stays in mm.">
          <SegmentedControl
            ariaLabel="Units"
            value={project.units}
            options={[
              { value: "mm", label: "mm" },
              { value: "inch", label: "inch" },
            ]}
            onChange={(u) => setUnits(u as Unit)}
          />
        </Field>
        <Field label="Schema">
          <div className="control is-select">
            <span className="val">v{project.schemaVersion} (draft)</span>
          </div>
        </Field>
      </div>
    </InspectorSection>
  );
}

export function ReferenceSection({ project }: { project: Project }) {
  const markMissing = useStore((s) => s.markReferenceMissing);
  const ref = project.reference;
  const calibrated = project.calibration?.status === "valid";
  if (!ref) {
    return (
      <InspectorSection icon="image" title="Reference">
        <Muted>
          No board reference yet. Add a photo or drawing to begin — you will calibrate it before anything is treated as a
          size.
        </Muted>
      </InspectorSection>
    );
  }
  return (
    <InspectorSection
      icon="image"
      title="Reference"
      right={calibrated ? <StateChip state="measured" label="Calibrated" /> : <StateChip state="uncalibrated" />}
    >
      <ObjectRow
        icon={ref.missing ? "image-off" : "image"}
        name={<span className="mono" style={{ fontSize: 11 }}>{ref.assetName}</span>}
        detail={`${ref.widthPx.toLocaleString()} × ${ref.heightPx.toLocaleString()} px`}
        right={ref.missing ? <Chip tone="missing">Not found</Chip> : undefined}
      />
      <div className="fgrid" style={{ marginTop: 8 }}>
        <Field span2 label="Capture">
          <div className="control is-select">
            <span className="val">{ref.capture.label}</span>
          </div>
        </Field>
      </div>
      <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="ghost" onClick={() => markMissing(!ref.missing)}>
          {ref.missing ? "Mark as located" : "Simulate missing image"}
        </Button>
      </div>
      <div className="fhelp" style={{ marginTop: 6 }}>
        Kept local. The image is a visual reference; it is never treated as physical truth.
      </div>
    </InspectorSection>
  );
}

export function BoardSection({ project }: { project: Project }) {
  const setBoardName = useStore((s) => s.setBoardName);
  const setBoardRevision = useStore((s) => s.setBoardRevision);
  const setThickness = useStore((s) => s.setThicknessMm);
  const t = project.board.thicknessMm;
  return (
    <InspectorSection icon="board" title="Board">
      <div className="fgrid">
        <TextInput span2 label="Board name" value={project.board.name} placeholder="e.g. MG-DEV-01" onCommit={setBoardName} />
        <TextInput label="Revision" value={project.board.revision} placeholder="—" onCommit={setBoardRevision} />
        <MmField
          label={
            <>
              Thickness {!isKnown(t) ? <Chip tone="neutral">unknown</Chip> : null}
            </>
          }
          mm={maybe(t) ?? null}
          onCommitMm={setThickness}
        />
      </div>
      <div className="fhelp" style={{ marginTop: 6 }}>
        Unknown stays unknown — it is never silently treated as zero.
      </div>
    </InspectorSection>
  );
}

export function CalibrationSection({ project }: { project: Project }) {
  const openCalibration = useStore((s) => s.openCalibration);
  const cal = project.calibration;
  const invalid = cal?.status === "invalid";
  return (
    <InspectorSection
      icon="ruler-plain"
      title="Calibration"
      right={invalid ? <Chip tone="missing">Invalid</Chip> : cal?.status === "valid" ? <StateChip state="measured" label="Valid" /> : undefined}
    >
      {cal ? (
        <ObjectRow
          icon="calibration-line"
          name={<>Line A – B</>}
          detail={
            invalid ? (
              <span className="miss">
                {isKnown(cal.knownMm) ? cal.knownMm.value.toFixed(2) : "?"} mm over{" "}
                {Math.round(Math.hypot(cal.anchors[1].x - cal.anchors[0].x, cal.anchors[1].y - cal.anchors[0].y))} px — rejected
              </span>
            ) : cal.status === "valid" ? (
              `${cal.pxPerMm!.toFixed(1)} px/mm · ${isKnown(cal.knownMm) ? cal.knownMm.value.toFixed(2) : "?"} mm (A–B)`
            ) : (
              "Awaiting a trusted distance"
            )
          }
        />
      ) : (
        <Muted>No calibration yet. Draw or accept the A–B line, then enter a distance you trust.</Muted>
      )}
      <div style={{ marginTop: 8 }}>
        <Button size="sm" icon="ruler-plain" onClick={openCalibration}>
          {cal ? "Edit calibration" : "Calibrate reference"}
        </Button>
      </div>
      {invalid ? (
        <div className="fhelp" style={{ marginTop: 6 }}>
          The previous state is untouched: nothing was overwritten with a bad scale.
        </div>
      ) : null}
    </InspectorSection>
  );
}

export function OutlineSection({ project }: { project: Project }) {
  const setSampleOutline = useStore((s) => s.setSampleOutline);
  const dims = outlineDims(project);
  const outline = project.board.outline;
  return (
    <InspectorSection
      icon="square-outline"
      title="Board outline"
      right={outline?.confirmed ? <StateChip state="confirmed" /> : undefined}
    >
      {outline ? (
        <Muted>
          {dims ? `${fmtLen(dims.widthMm, project.units)} × ${fmtLen(dims.heightMm, project.units)} ${unitLabel(project.units)} · ` : ""}
          {outline.vertices.length} corners · closed
        </Muted>
      ) : (
        <>
          <Muted>No outline yet. Use the polygon tool to drag a rectangle around the board, or trace the sample.</Muted>
          <div style={{ marginTop: 8 }}>
            <Button size="sm" onClick={setSampleOutline}>
              Trace sample board edge
            </Button>
          </div>
        </>
      )}
    </InspectorSection>
  );
}

function HoleEditor({ project, hole }: { project: Project; hole: MountingHole }) {
  const updateHole = useStore((s) => s.updateHole);
  const confirmHole = useStore((s) => s.confirmHole);
  const deleteHole = useStore((s) => s.deleteHole);
  const frame = boardFrame(project);
  const mm = holeMm(hole, frame);
  const missing = !isKnown(hole.diameterMm);
  return (
    <InspectorSection title={`Selected — hole ${hole.label}`}>
      <div className="fgrid">
        <MmField
          label="Center X"
          mm={mm.centerMm ? mm.centerMm.x : null}
          onCommitMm={(x) => {
            if (x == null || !frame || !mm.centerMm) return;
            const img = boardMmToImage(project, { x, y: mm.centerMm.y });
            if (img) updateHole(hole.id, { center: img });
          }}
        />
        <MmField
          label="Center Y"
          mm={mm.centerMm ? mm.centerMm.y : null}
          onCommitMm={(y) => {
            if (y == null || !frame || !mm.centerMm) return;
            const img = boardMmToImage(project, { x: mm.centerMm.x, y });
            if (img) updateHole(hole.id, { center: img });
          }}
        />
        <MmField
          label="Diameter"
          mm={maybe(hole.diameterMm) ?? null}
          invalid={missing}
          onCommitMm={(d) => updateHole(hole.id, { diameterMm: d })}
          help={missing ? "Required to size the standoff and screw." : undefined}
          helpError={missing}
        />
        <Field label="Fastener">
          <SelectField ariaLabel="Fastener" value={hole.fastener} options={FASTENERS} onChange={(f) => updateHole(hole.id, { fastener: f })} />
        </Field>
        <Field span2 label="Position source">
          <div className="control is-select">
            <span className="val">
              {hole.positionSource === "clicked-calibrated"
                ? "Clicked on image (calibrated)"
                : hole.positionSource === "inferred-pattern"
                  ? "Pattern symmetry (inferred)"
                  : "Typed values"}
            </span>
          </div>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <Button size="sm" icon="check" disabled={missing || hole.state === "confirmed"} onClick={() => confirmHole(hole.id)}>
          Mark confirmed
        </Button>
        <Button size="sm" variant="ghost" onClick={() => deleteHole(hole.id)}>
          Delete
        </Button>
      </div>
      {missing ? (
        <div className="fhelp" style={{ marginTop: 6 }}>
          Confirm becomes available once required values exist.
        </div>
      ) : null}
    </InspectorSection>
  );
}

export function HolesSection({ project }: { project: Project }) {
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.ui.selection);
  const setTool = useStore((s) => s.setTool);
  const addHoleAtCenter = useStore((s) => s.addHoleAtCenter);
  const frame = boardFrame(project);
  const holes = project.board.holes;
  const selected = selection.kind === "hole" ? holes.find((h) => h.id === selection.id) : undefined;

  return (
    <>
      <OutlineSection project={project} />
      <InspectorSection
        icon="hole"
        title={`Mounting holes · ${holes.length}`}
        right={
          <Button
            size="sm"
            variant="ghost"
            style={{ height: 20, padding: "0 6px" }}
            title="Add a hole at the board center (then set its diameter)"
            onClick={() => {
              setTool("hole");
              addHoleAtCenter();
            }}
          >
            + Add
          </Button>
        }
      >
        {holes.length === 0 ? (
          <Muted>Pick the hole tool and click each pad center. Then type the exact drill or screw diameter.</Muted>
        ) : (
          holes.map((h) => {
            const mm = holeMm(h, frame);
            const missing = !isKnown(h.diameterMm);
            const dia = maybe(h.diameterMm);
            return (
              <ObjectRow
                key={h.id}
                icon={h.state === "inferred" ? "circle-dashed" : "hole-ring"}
                selected={selection.kind === "hole" && selection.id === h.id}
                onClick={() => select({ kind: "hole", id: h.id })}
                name={h.label}
                detail={
                  <>
                    {mm.centerMm ? `(${fmtLen(mm.centerMm.x, project.units)}, ${fmtLen(mm.centerMm.y, project.units)}) · ` : ""}
                    {missing ? (
                      <span className="miss">⌀ missing</span>
                    ) : (
                      `⌀${dia != null ? fmtLen(dia, project.units) : "—"} · ${h.fastener}`
                    )}
                  </>
                }
                right={stateToChip(h.state, missing)}
              />
            );
          })
        )}
      </InspectorSection>
      {selected ? <HoleEditor project={project} hole={selected} /> : null}
    </>
  );
}

function keepOutSizeLabel(project: Project, ko: KeepOut): string {
  const u = project.units;
  if (ko.shape === "rect" && ko.rectPx) {
    const d = rectMm(project, ko.rectPx);
    return d ? `${fmtLen(d.w, u)} × ${fmtLen(d.h, u)}` : "—";
  }
  if (ko.shape === "circle" && ko.circlePx) {
    const d = rectMm(project, { x: 0, y: 0, w: ko.circlePx.radiusPx * 2, h: 0 });
    return d ? `⌀ ${fmtLen(d.w, u)}` : "—";
  }
  if (ko.shape === "polygon" && ko.polygonPx) return `${ko.polygonPx.length} vertices`;
  return "—";
}

function KeepOutEditor({ project, ko }: { project: Project; ko: KeepOut }) {
  const updateKeepOut = useStore((s) => s.updateKeepOut);
  const deleteKeepOut = useStore((s) => s.deleteKeepOut);
  return (
    <InspectorSection title={`Selected — ${ko.label}`}>
      <div className="fgrid">
        <Field label="Shape">
          <SelectField
            ariaLabel="Shape"
            value={ko.shape}
            options={[
              { value: "rect", label: "Rectangle" },
              { value: "circle", label: "Circle" },
              { value: "polygon", label: "Polygon" },
            ]}
            onChange={(shape) => updateKeepOut(ko.id, { shape })}
          />
        </Field>
        <Field label="Board side">
          <SelectField
            ariaLabel="Board side"
            value={ko.boardSide}
            options={[
              { value: "top", label: "Top" },
              { value: "bottom", label: "Bottom" },
            ]}
            onChange={(boardSide) => updateKeepOut(ko.id, { boardSide })}
          />
        </Field>
        <Field label={ko.shape === "circle" ? "Diameter" : ko.shape === "polygon" ? "Vertices" : "W × H"}>
          <div className="control">
            <span className="val num">{keepOutSizeLabel(project, ko)}</span>
            {ko.shape !== "polygon" ? <span className="unit">{unitLabel(project.units)}</span> : null}
          </div>
        </Field>
        <MmField
          label="Clearance height"
          mm={maybe(ko.clearanceHeightMm) ?? null}
          onCommitMm={(h) => updateKeepOut(ko.id, { clearanceHeightMm: h })}
        />
        <Field span2 label="Purpose">
          <TextInput ariaLabel="Purpose" value={ko.purpose} onCommit={(purpose) => updateKeepOut(ko.id, { purpose })} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <Button size="sm" variant="ghost" onClick={() => deleteKeepOut(ko.id)}>
          Delete
        </Button>
      </div>
      <div className="fhelp" style={{ marginTop: 6 }}>
        Purpose travels with the board definition — later tools can route around it.
      </div>
    </InspectorSection>
  );
}

export function KeepOutsSection({ project }: { project: Project }) {
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.ui.selection);
  const setTool = useStore((s) => s.setTool);
  const addKeepOutCenter = useStore((s) => s.addKeepOutCenter);
  const kos = project.board.keepOuts;
  const selected = selection.kind === "keepout" ? kos.find((k) => k.id === selection.id) : undefined;
  return (
    <>
      <InspectorSection
        icon="keepout"
        title={`Keep-outs · ${kos.length}`}
        right={
          <Button
            size="sm"
            variant="ghost"
            style={{ height: 20, padding: "0 6px" }}
            title="Add a keep-out at the board center (then set its size and clearance)"
            onClick={() => {
              setTool("keepout");
              addKeepOutCenter();
            }}
          >
            + Add
          </Button>
        }
      >
        {kos.length === 0 ? (
          <Muted>Drag the keep-out tool over connectors, tall parts, or service access. Enter each clearance height.</Muted>
        ) : (
          kos.map((k) => {
            const box = k.rectPx;
            const dimMm = box ? rectMm(project, box) : null;
            return (
              <ObjectRow
                key={k.id}
                icon={k.shape === "circle" ? "circle-dashed" : "keepout-sm"}
                selected={selection.kind === "keepout" && selection.id === k.id}
                onClick={() => select({ kind: "keepout", id: k.id })}
                name={`${k.label} · ${k.purpose}`}
                detail={
                  <>
                    {dimMm ? `rect ${fmtLen(dimMm.w, project.units)} × ${fmtLen(dimMm.h, project.units)} · ` : ""}
                    height {isKnown(k.clearanceHeightMm) ? fmtLen(k.clearanceHeightMm.value, project.units) : "—"} · {k.boardSide}
                  </>
                }
                right={<StateChip state={k.state === "inferred" ? "inferred" : "measured"} />}
              />
            );
          })
        )}
      </InspectorSection>
      {selected ? <KeepOutEditor project={project} ko={selected} /> : null}
    </>
  );
}

export function MeasurementsSection({ project }: { project: Project }) {
  const setThickness = useStore((s) => s.setThicknessMm);
  const t = project.board.thicknessMm;
  return (
    <InspectorSection icon="ruler" title="Measurements">
      <div className="fgrid">
        <MmField
          span2
          label={<>Board thickness {!isKnown(t) ? <Chip tone="neutral">unknown</Chip> : null}</>}
          mm={maybe(t) ?? null}
          onCommitMm={setThickness}
          help="Values the image cannot safely supply are typed here and travel with the board definition."
        />
      </div>
    </InspectorSection>
  );
}

export function MountSection({ project }: { project: Project }) {
  const setMountField = useStore((s) => s.setMountField);
  const m = project.mount;
  const gen = project.generated;
  return (
    <>
      <InspectorSection icon="cube-outline" title="Mount strategy">
        <div className="fgrid">
          <Field span2 label="Strategy">
            <SelectField
              ariaLabel="Strategy"
              value={m.kind}
              options={[
                { value: "plate-standoffs", label: "Plate + standoffs" },
                { value: "rect-plate", label: "Rectangular plate" },
                { value: "standoff-bridge", label: "Standoff bridge" },
              ]}
              onChange={(kind) => setMountField({ kind })}
            />
          </Field>
          <MmField label="Standoff height" mm={maybe(m.standoffHeightMm) ?? null} onCommitMm={(v) => setMountField({ standoffHeightMm: v })} />
          <MmField label="Base thickness" mm={maybe(m.baseThicknessMm) ?? null} onCommitMm={(v) => setMountField({ baseThicknessMm: v })} />
          <Field span2 label="Fastener">
            <SelectField
              ariaLabel="Fastener style"
              value={m.fastenerStyle}
              options={[
                { value: "heat-set-insert", label: `${m.fastener} heat-set insert` },
                { value: "self-tapping", label: `${m.fastener} self-tapping` },
                { value: "through-bolt", label: `${m.fastener} through-bolt` },
              ]}
              onChange={(fastenerStyle) => setMountField({ fastenerStyle })}
            />
          </Field>
          <MmField label="Boss ⌀" mm={maybe(m.bossDiameterMm) ?? null} onCommitMm={(v) => setMountField({ bossDiameterMm: v })} />
          <Field label="Side tabs">
            <SegmentedControl
              ariaLabel="Side tabs"
              value={String(m.sideTabs)}
              options={[
                { value: "0", label: "0" },
                { value: "2", label: "2" },
                { value: "4", label: "4" },
              ]}
              onChange={(v) => setMountField({ sideTabs: Number(v) as 0 | 2 | 4 })}
            />
          </Field>
          <MmField label="Clearance" mm={maybe(m.clearanceMm) ?? null} onCommitMm={(v) => setMountField({ clearanceMm: v })} />
          <Field label="Tolerance">
            <SelectField
              ariaLabel="Tolerance"
              value={m.tolerance}
              options={[
                { value: "fdm-0.20", label: "FDM ± 0.20" },
                { value: "fdm-0.15", label: "FDM ± 0.15" },
                { value: "sla-0.05", label: "SLA ± 0.05" },
                { value: "custom", label: "Custom" },
              ]}
              onChange={(tolerance) => setMountField({ tolerance })}
            />
          </Field>
          {m.tolerance === "custom" ? (
            <MmField
              label="Custom offset"
              mm={m.customToleranceMm}
              onCommitMm={(v) => setMountField({ customToleranceMm: v })}
              placeholder="required"
              invalid={m.customToleranceMm == null}
            />
          ) : null}
        </div>
        <div className="fhelp" style={{ marginTop: 8 }}>
          {m.tolerance === "custom" && m.customToleranceMm == null
            ? "The custom profile needs an explicit fit offset — generation is blocked until one is set."
            : "Clearances and tolerances are explicit parameters — never hidden constants."}
        </div>
      </InspectorSection>

      <InspectorSection
        icon="cube-flat"
        title="Generation"
        right={
          gen && isGenerationCurrent(project) ? (
            <StateChip state="generated" label="Up to date" />
          ) : gen ? (
            <Chip tone="neutral">Stale</Chip>
          ) : undefined
        }
      >
        {gen ? (
          <>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              Params <span className="mono">{gen.paramsHash.slice(0, 6)}…{gen.paramsHash.slice(-4)}</span> · project v
              {gen.sourceVersion}
              {gen.durationMs != null ? ` · ${(gen.durationMs / 1000).toFixed(1)} s` : ""}
            </div>
            <div className="fhelp" style={{ marginTop: 6 }}>
              {isGenerationCurrent(project)
                ? "Preview and export consume this same generated result."
                : "The model changed since this was generated — regenerate before exporting."}
            </div>
          </>
        ) : (
          <Muted>Resolve blocking inputs to generate the bracket from the canonical model.</Muted>
        )}
      </InspectorSection>
    </>
  );
}

export function ExportSections({ project }: { project: Project }) {
  const saveBoard = useStore((s) => s.saveBoardToLibrary);
  return (
    <>
      <InspectorSection icon="export" title="Export history">
        {project.exports.length === 0 ? (
          <Muted>No exports yet for this project. Every export is listed here with its parameters and file location.</Muted>
        ) : (
          project.exports.map((e) => (
            <ObjectRow
              key={e.id}
              icon="file"
              name={<span className="mono" style={{ fontSize: 11 }}>{e.fileName}</span>}
              detail={`${e.format.toUpperCase()} · ${e.sizeBytes} B${e.wroteSidecar ? " · +sidecar" : ""}`}
              right={<Chip tone="neutral">Exported</Chip>}
            />
          ))
        )}
      </InspectorSection>
      <InspectorSection icon="board" title="Reusable board definition">
        <Muted>
          Saving keeps <b>{project.board.name || project.name}</b>
          {project.board.revision ? ` ${project.board.revision}` : ""} — outline, holes, keep-outs, and provenance —
          reusable for other mount strategies later.
        </Muted>
        <div style={{ marginTop: 9 }}>
          <Button size="sm" icon="save" onClick={saveBoard}>
            Save board to library
          </Button>
        </div>
      </InspectorSection>
    </>
  );
}
