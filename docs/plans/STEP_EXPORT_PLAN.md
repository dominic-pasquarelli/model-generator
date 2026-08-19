---
title: STEP Export and Fusion Import Gate Plan
tier: workflow
status: proposed
updated: 2026-08-19
audited: 2026-08-19
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0006-initial-export-format-contract.md
---

# STEP Export and Fusion Import Gate Plan

> **Status update (2026-08-19):** The **readiness gate, STL writer, faceted-B-rep STEP writer, and metadata sidecar are Built** and Verified host-level (ADR 0006 Accepted): `src/core/export/{stl,step,exporter}.ts`. STEP is a real AP214 `MANIFOLD_SOLID_BREP` closed-shell solid (one body per mesh body), structurally validated in tests. This satisfies plan Steps 1–5 with the caveat that the geometry path is the self-contained faceted mesh (ADR 0005), not an analytic kernel. **Step 6 — the Autodesk Fusion import evidence gate — is the open blocker:** no `evidence/fusion-import/` record exists, so no "usable in Fusion" claim is made. The Fusion protocol below is the exact next action.

## Purpose & Scope

This plan specifies the export pipeline for Board Mount Designer: the readiness gate that
decides when generated geometry is trustworthy enough to leave the app, STEP (`.step` / `.stp`)
as the MVP CAD target, STL as a secondary mesh-only artifact, the metadata sidecar JSON schema,
and the Autodesk Fusion import evidence gate that earns the word "supported" per format.

Status is `proposed`. Nothing here is Built or Verified. No export format is Ratified; `ADR 0006`
owns that ruling and this document proposes the contract that ratification would confirm. Scope
maps to Phase 7 of `docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md` (PR 8) and depends on the geometry
adapter delivered in Phase 5 (`ADR 0005`). Out of scope: parametric editability inside Fusion,
general STEP interoperability beyond the named fixture and Fusion version, 3MF, and cloud delivery.

## Where It Fits (architecture seam)

The export pipeline is the `Export pipeline` row of the Canonical Data Flow in `docs/ARCHITECTURE.md`:
it owns readiness checks, format output, metadata, and warnings; it must not own unsupported
editability or fidelity claims. It sits downstream of the geometry service and consumes exactly the
same generated solid the preview renderer consumes. This is the "same canonical model or documented
shared geometry path" rule from `AGENTS.md` and `docs/workflows/BOARD_MOUNT_DESIGNER.md`.

```text
Canonical semantic model (ADR 0004)
        │
        ▼
Geometry adapter (ADR 0005) ──► GeneratedSolid (kernel handle + provenance)
        │                                   │
        ├──────────────► Preview renderer   │  (derived tessellation only)
        │                                   ▼
        └──────────────► Export pipeline ──► readiness gate ──► STEP writer  ──► board-mount.step
                                                          └────► STL writer   ──► board-mount.stl
                                                          └────► sidecar      ──► board-mount.meta.json
```

The pipeline never re-derives geometry from pixels or from the preview mesh. STEP and STL are two
writers over one `GeneratedSolid`; STL is a tessellation of the same solid, never an independent path.

## Candidate Approaches

The writer choice is constrained by the kernel chosen in `ADR 0005`; export cannot promise a format
the kernel cannot emit. Candidates below are for the STEP writer specifically.

| Candidate | STEP source | Determinism | Risk | Decision gate |
|---|---|---|---|---|
| OpenCASCADE (OCCT) via `opencascade.js` WASM | `STEPControl_Writer`, AP214/AP242 | High (same kernel as generation) | WASM size (~10-30MB), memory, startup cost | Emits AP214 STEP that passes the Fusion gate in-browser |
| OCCT in a Web Worker | Same writer, off main thread | High | Transfer of file bytes across worker boundary | Deterministic bytes + cancel/progress preserved |
| OCCT in Electron/local helper | Native OCCT `STEPControl_Writer` | High | Desktop packaging, hidden dependency | Only if browser WASM fails the gate |
| `manifold` / mesh-boolean kernel + external STEP | Mesh boolean, no native BREP | N/A for STEP | Mesh has no exact faces; STEP would be faceted shell | Rejected as MVP CAD path; usable for STL only |

Decision gates (owned by `ADR 0005` and `ADR 0006`):

- G1: the selected kernel produces a STEP file for the Phase 0 fixture at all.
- G2: that STEP imports into Fusion with correct millimeter scale (the gate below).
- G3: browser/WASM path holds within acceptable bundle and time budgets, else fall back to worker,
  then Electron helper. Falling back changes packaging, not the export contract or the metadata schema.

STL is not a candidate decision; any mesh tessellation of the `GeneratedSolid` (kernel triangulation
such as OCCT `BRepMesh_IncrementalMesh`, or the preview mesh with documented equivalence) satisfies it.

## Data / Interface Contracts

Export operates on a `GeneratedSolid` produced by the geometry adapter and a `ReadinessReport`
computed from validation. The public seam is deliberately format-agnostic.

```ts
type ExportFormat = 'step' | 'stl';

interface GeneratedSolid {
  handle: KernelSolidRef;            // opaque kernel handle; never serialized as truth
  sourceProjectVersion: string;      // canonical model version this was generated from
  parametersHash: string;            // sha-256 of the canonicalized generation inputs
  bodyCount: number;                 // distinct solids (plate + standoffs may be fused or separate)
  boundingBoxMm: { x: number; y: number; z: number };
  warnings: GenerationWarning[];     // carried from generation, e.g. keep-out clip applied
}

interface ReadinessReport {
  ready: boolean;                    // true only when zero errors + calibration valid + required dims present
  calibration: 'valid' | 'stale' | 'missing';
  requiredDimsPresent: boolean;      // thickness, hole diameters, standoff height, clearance, tolerance
  errors: ValidationItem[];          // any non-empty => ready=false
  warnings: ValidationItem[];        // do not block; surfaced in sidecar and dialog
  blockers: ReadinessBlocker[];      // human-readable rows for the ReadinessRow UI + Fix links
}

interface ExportRequest {
  formats: ExportFormat[];           // ['step'] default; ['step','stl'] optional
  solid: GeneratedSolid;
  readiness: ReadinessReport;        // export() rejects if !readiness.ready
}

interface ExportResult {
  files: ExportedFile[];             // one per format + one sidecar
  sidecar: ExportMetadata;
}

interface ExportedFile { name: string; bytes: Uint8Array; format: ExportFormat | 'meta'; }

// Hard invariant: export(req) throws ExportBlockedError when !req.readiness.ready.
declare function exportModel(req: ExportRequest): Promise<ExportResult>;
```

The metadata sidecar is a sibling `*.meta.json` next to each artifact (embedded STEP header comments
are impractical to keep machine-readable across writers; `ADR 0006` allows a sidecar when embedded
metadata is impractical). Schema:

```jsonc
{
  "schemaVersion": "1.0.0",          // sidecar schema, independent of project schema
  "generator": {
    "name": "board-mount-designer",
    "version": "0.0.0",              // app/generator version string
    "kernel": "occt-7.8-wasm"        // provenance of the geometry path
  },
  "units": "mm",                     // always explicit; unknown is never silently mm or zero
  "projectSchemaVersion": "1",       // canonical model schema (ADR 0004 / ADR 0007)
  "parametersHash": "sha256:…",      // must equal GeneratedSolid.parametersHash
  "calibration": {                   // provenance, not a re-measurement
    "state": "measured",             // measured | inferred | confirmed
    "pxPerMm": 11.94,
    "referenceDistanceMm": 40.0,
    "source": "user-line"
  },
  "boundingDimsMm": { "x": 82.0, "y": 51.0, "z": 12.6 },
  "bodyCount": 3,
  "artifacts": [
    { "file": "board-mount.step", "format": "step", "sha256": "…" },
    { "file": "board-mount.stl",  "format": "stl",  "sha256": "…" }
  ],
  "warnings": [
    { "code": "keepout.clip", "message": "Standoff 2 trimmed to respect keep-out K1." }
  ],
  "unsupportedClaims": [             // recorded so downstream never over-reads the artifact
    "no-parametric-editability-in-fusion",
    "no-general-step-compatibility-beyond-named-tool"
  ]
}
```

`parametersHash` in the sidecar MUST equal `GeneratedSolid.parametersHash`; a mismatch means the
exported file did not come from the previewed solid and export must abort. This is the
preview/export parity guarantee made machine-checkable.

## Phased Implementation Steps

1. **Readiness gate.** Implement `ReadinessReport` from the validation core: zero errors, calibration
   `valid`, all required dims present. Wire the `ReadinessRow` list and disabled Export button from
   `docs/design/COMPONENT_SPEC.md` (step 08) so a disabled Export always shows its blockers with Fix
   links. *Exit Evidence (host-level):* unit tests prove `ready=false` for missing calibration, a
   missing hole diameter, and any error; `ready=true` only when all pass.

2. **STEP writer over the adapter.** Add `export/fusionStep/` STEP writer calling the selected kernel's
   STEP export (e.g. OCCT `STEPControl_Writer`, AP214, `Interface_Static` unit = MM). Emit bytes, do
   not write to disk directly from the writer. *Exit Evidence (generated-geometry-level):* the writer
   produces a non-empty STEP for the Phase 0 fixture and a re-parse (OCCT `STEPControl_Reader`) yields
   the same body count and bounding box within tolerance.

3. **Metadata sidecar.** Implement the schema above, compute `sha256` per artifact, assert
   `parametersHash` parity against `GeneratedSolid`. *Exit Evidence (host-level):* schema round-trips;
   a deliberately mismatched hash aborts export with `ExportBlockedError`.

4. **STL secondary writer.** Tessellate the same `GeneratedSolid` (kernel triangulation) and write
   binary STL. Mark it secondary/diagnostic in the sidecar `artifacts` and in the RadioCard UI.
   *Exit Evidence (generated-geometry-level):* STL bounding box matches STEP bounding box within named
   mesh tolerance; STL is never offered as the sole artifact.

5. **Download/delivery boundary.** Deliver files via a Blob + object URL (browser) or the Electron
   file dialog (desktop path), naming `board-mount.step`, `board-mount.stl`, `board-mount.meta.json`.
   *Exit Evidence (browser-level):* UI smoke test drives the export dialog to completion and asserts
   three files with correct names for the fixture, or a single STEP + sidecar when STL is unchecked.

6. **Fusion import evidence gate.** Execute the manual protocol below against the exported STEP and
   record results under `evidence/fusion-import/`. *Exit Evidence (generated-geometry-level, promoted
   toward downstream-CAD):* measured Fusion checks match expected fixture dimensions within tolerance;
   `ADR 0006` updated with the earned supported/unsupported claims.

7. **Claim ledger update.** Fill the sidecar `unsupportedClaims` and update `ADR 0006`'s claim table
   only with evidence that exists. *Exit Evidence (host-level):* the phrases in `unsupportedClaims`
   match the "Blocked Until Evidence Exists" list in `ADR 0006`; no claim exceeds recorded evidence.

## Fusion Import Evidence Gate Protocol

This is the human procedure that promotes "STEP generated" to "STEP export is usable for the named
fixture and Fusion version" per the `ADR 0006` claim table. It is manual and version-stamped.

Import steps:

1. Open Autodesk Fusion (record exact version, e.g. `Fusion 2.0.xxxxx`), new empty document.
2. `Insert` / `Upload` the exported `board-mount.step`, accept default insert.
3. Confirm Fusion reports the import without unit-conversion prompts; if prompted, record the choice.

Measured checks (record each expected vs. measured value and delta):

| Check | How to measure in Fusion | Pass condition |
|---|---|---|
| Unit scale | Measure a known fixture edge (e.g. board width) | Within ±0.1 mm of the sidecar `boundingDimsMm` |
| Bounding box | Fusion Section/Measure bounding box | X/Y/Z match sidecar within ±0.1 mm |
| Standoff positions | Measure standoff centers vs. hole centers | Within calibration + tolerance budget |
| Hole diameters | Measure each bore | Within ±(tolerance) of entered diameter |
| Body count | Browser tree body count | Equals sidecar `bodyCount` |

Evidence layout (`evidence/fusion-import/<date>-<fixture>/`):

```text
evidence/fusion-import/2026-08-17-fixture-a/
  step-source.meta.json      # copy of the sidecar exported alongside the STEP
  import-01-open.png         # Fusion showing the imported body
  import-02-measure-bbox.png # bounding box measurement
  import-03-holes.png        # hole diameter measurements
  notes.md                   # version, expected vs measured table, deltas, pass/fail, tolerances
```

`notes.md` names: Fusion version, OS, the fixture id, the sidecar `parametersHash`, and every
expected-vs-measured delta. Only after this file exists may `ADR 0006` mark STEP "usable for the
named fixture and Fusion version". "Supported" is earned per format and per named tool version, never
generalized.

## Earned vs. Not-Claimed

| Format | Earned when | Explicitly NOT claimed |
|---|---|---|
| STEP | Fusion gate `notes.md` passes for the fixture | General STEP interop beyond named Fusion version; parametric/editable features inside Fusion |
| STL | Bounding box matches STEP for the fixture | CAD import fidelity; that STL proves the MVP; watertight-for-print without slicer check |
| Sidecar | Schema round-trips and parity holds | That metadata is embedded in the CAD file itself |

No claim of parametric editability inside Fusion is ever made: STEP imports as a static BREP body.
This matches the `ADR 0006` "Blocked Until Evidence Exists" list and the MVP Non-Goals.

## Failure Modes & Diagnostics

- **Ready but wrong solid:** `parametersHash` mismatch between sidecar and `GeneratedSolid`. Diagnostic:
  abort with `ExportBlockedError` naming both hashes; never write a divergent file.
- **STEP writer emits empty/invalid file:** re-parse check in step 2 fails. Diagnostic: report the
  affected body ids and the writer return code; block export.
- **Fusion unit mismatch (imports at 10x or 0.1x):** the classic risk in the MVP plan. Diagnostic: the
  gate's unit-scale check catches it; fix is to pin the writer's length unit to MM explicitly, not to
  rescale after the fact.
- **Keep-out silently ignored:** generation must emit a `keepout.clip` warning carried into the sidecar;
  a clip with no warning is a defect. Diagnostic: cross-check warning count against generation.
- **Calibration stale:** model edited after calibration. `ReadinessReport.calibration = 'stale'` blocks
  export rather than exporting pixels-as-mm.
- **Large export blocks UI:** if STEP writing exceeds ~300ms, run in a worker with determinate progress
  and a Cancel that leaves the last good result untouched (per `docs/design/COMPONENT_SPEC.md`).

## Testing & Evidence

| Layer | Test | Evidence class |
|---|---|---|
| Readiness | error/calibration/required-dim gating truth table | host-level |
| STEP writer | non-empty STEP; re-parse body count + bbox | generated-geometry-level |
| Sidecar | schema round-trip; hash-parity abort | host-level |
| STL | bbox parity with STEP; never sole artifact | generated-geometry-level |
| Dialog | UI smoke: export produces correctly named files | browser-level |
| Fusion gate | measured import checks in `evidence/fusion-import/` | downstream-CAD (manual) |
| Print follow-up | optional first-fit (Phase 9) | printed-part-level |

Automated tests may verify STEP validity by re-reading with the same kernel; they may NOT assert
Fusion behavior. Fusion evidence is manual and lives in `evidence/fusion-import/` until an automatable
downstream check exists.

## Open Decisions

- Which STEP flavor (AP214 vs AP242) — owned by `ADR 0005` (kernel) and confirmed by `ADR 0006`.
- Whether metadata is sidecar-only or partially embedded in the STEP header — owned by `ADR 0006`.
- Whether bodies export fused (single) or separate (plate + standoffs) — affects `bodyCount`; owned by
  `ADR 0005` generation strategy, recorded by `ADR 0006`.
- STL inclusion by default vs opt-in — owned by `ADR 0006`.
- Named Fusion version(s) the gate certifies — recorded in `ADR 0006` claim table as evidence accrues.

## Risks & Counters

| Risk | Counter |
|---|---|
| Browser STEP export not viable | Keep the writer behind the `ADR 0005` adapter; fall back worker → Electron helper without changing the contract. |
| STL mistaken for CAD success | STL is marked secondary in sidecar and UI; the Fusion gate is STEP-only. |
| Export diverges from preview | `parametersHash` parity check aborts any mismatch; both consume one `GeneratedSolid`. |
| Fusion scale wrong | Unit pinned to MM in the writer; unit-scale check is the first gate measurement. |
| "Supported" over-claimed | Claims are per-format, per-named-Fusion-version, and require a passing `notes.md` before `ADR 0006` records them. |
| Sidecar drifts from project schema | Sidecar carries `projectSchemaVersion` separately and is versioned independently. |
