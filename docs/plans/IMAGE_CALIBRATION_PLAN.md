---
title: Image Reference Pipeline and Calibration Engine Plan
tier: workflow
status: proposed
updated: 2026-08-17
audited: 2026-08-17
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0008-image-processing-and-privacy-boundary.md
---

# Image Reference Pipeline and Calibration Engine Plan

## Purpose & Scope

This plan covers everything between "the user has a board in front of them" and "the app holds a trustworthy
pixel-to-millimeter transform": image ingest (PNG/JPEG/SVG/PDF-drawing), optional browser camera capture,
local-only asset storage and the privacy boundary, the calibration engine math (single line, perpendicular
second line, skew/anisotropy detection), plausibility rejection, calibration provenance, the pixel<->mm affine
transform contract, and reference-missing recovery. It is the robustness spec behind `BOARD_MOUNT_DESIGNER_MVP_PLAN`
Phase 3 and the required early states in `docs/UX_VISION.md`.

Status is **proposed**. Nothing here is Built or Verified. The only product code present in this tree today is
`src/styles/tokens.css`; the single-line calibration + plausibility-rejection shell described in the assignment is
**not yet evidenced in code** and is treated here as a starting posture to harden, not a completed fact. Every
ratification (embed-vs-reference, camera-in-MVP, privacy copy) points back to `ADR 0008`.

Non-goals (inherited from `BOARD_MOUNT_DESIGNER_MVP_PLAN` and `docs/PROJECT_VISION.md`): automatic board detection,
component recognition, and perspective correction beyond a bounded calibration workflow. No photograph yields
physical dimensions without a user measurement. Unknown scale is never silently `0` or `1`.

## Where It Fits (architecture seam)

Per `docs/ARCHITECTURE.md`, the reference asset stage "owns image, drawing, provenance, calibration anchors" and
"must not own physical dimensions without calibration." This feature is that stage plus the calibration slice of the
shared domain core. Proposed module placement, following the `BOARD_MOUNT_DESIGNER_MVP_PLAN` repository shape:

```text
src/core/units/            calibration.ts (engine), transform.ts (affine contract), plausibility.ts
src/core/project/          referenceAsset.ts (schema, provenance), assetStore.ts (IndexedDB seam)
src/tools/board-mount-designer/
  editor2d/                CalibrationLine overlay, capture/upload affordances, relink dialog
  ingest/                  decoders (raster, svg, pdf), exifStrip.ts, cameraCapture.ts
```

Hard boundaries this seam must honor:

- The engine (`core/units`) is pure and host-testable: it takes anchor pixel coords + measured distances and returns a
  transform or a typed rejection. It imports no DOM, no React, no canvas.
- Ingest/decoders and `assetStore` own bytes and the privacy boundary; they never compute scale.
- The calibration transform is the single sanctioned bridge from image space to board/model space. Preview and export
  consume board-space coordinates only, so both derive from the same transform (satisfies the shared-geometry-path rule).

## Candidate Approaches

Three decisions carry real cost: how bytes are stored, how far distortion correction goes, and whether camera capture
ships in the first slice.

### Storage and privacy candidates

| Candidate | How | Pros | Cons | Decision gate (`ADR 0008`) |
|---|---|---|---|---|
| Embed bytes in project file (base64/Blob) | Store re-encoded image inside the project JSON/container | Self-contained; no relink needed; survives file moves | Large files; JSON bloat; re-encode cost | Owner ruling on embed vs reference vs both |
| Local relative reference (path handle) | Store a relative path / File System Access handle | Small project files; original stays put | Breaks on move/rename; needs relink flow | Same ruling; also needs missing-file warning copy |
| Both (embed small, reference large) | Threshold (e.g. <2 MB embed, else reference) | Balances size and portability | Two code paths; threshold is arbitrary until measured | Requires threshold + provenance spike answers |
| IndexedDB blob store keyed by asset id | Bytes live in IndexedDB; project holds only the id + hash | Handles large images; no filesystem coupling | Bound to one browser/origin; export must re-materialize | Candidate default for browser-first MVP |

Proposed starting default: **IndexedDB blob store keyed by asset id, with a content hash in the project**; embed-on-export
as a documented option. This is a candidate, not a ratified choice — `ADR 0008` owns embed vs reference vs both.

### Distortion-correction depth candidates

| Candidate | Technique | When it earns its cost | Gate |
|---|---|---|---|
| Uniform scale only | single line -> `s = mm / pxdist` | Approximately top-down photo or vector drawing | Phase 3 baseline; MVP core assumption |
| Anisotropy + skew detection | second perpendicular line -> `sx, sy`, measured angle vs 90 deg | Mild non-square pixels / off-axis tilt; **warn, do not silently correct** | Phase 4 gate: warn threshold agreed |
| 2-axis affine correction | apply `sx != sy` and shear from two measured lines | User accepts an approximate anisotropic map | Off by default; opt-in behind a warning |
| Homography / undistort | 4+ known points, OpenCV.js `getPerspectiveTransform` / `undistort` | True perspective; explicitly a non-goal for MVP | Deferred; needs `ADR 0008` scope expansion |

Proposed: ship uniform scale; **detect** anisotropy/skew from an optional second line and surface it as a warning with a
number ("axes differ by 3.1%", "corner angle 86.4 deg"). Applying anisotropic correction is opt-in and clearly `Inferred`.
Homography stays out of scope (`BOARD_MOUNT_DESIGNER_MVP_PLAN` non-goal).

### Camera-capture candidates

| Candidate | Pro | Con | Gate |
|---|---|---|---|
| Upload only, add camera later | Fastest to a working calibrate path | Owner may want in-demo capture | Open owner call in `BOARD_MOUNT_DESIGNER_MVP_PLAN` |
| `getUserMedia` capture with top-down guidance overlay | One-tap board photo; guidance reduces tilt | Permissions, orientation, lighting variance | `ADR 0008` Phase 0 says camera must not block upload |
| File-input `capture` attribute (mobile) | Trivial; uses OS camera app | No live guidance overlay | Cheap fallback if `getUserMedia` slips |

Proposed: build upload first (Phase 3), add `getUserMedia` behind the same `ReferenceAsset` contract so capture is just a
second byte source. Guidance affordance is a level bubble / crosshair overlay, not auto-correction.

## Data / Interface Contracts

The affine transform is the load-bearing contract. It is a 2x3 matrix mapping homogeneous image pixels to board
millimeters, `[x_mm, y_mm]^T = M * [x_px, y_px, 1]^T`, plus its inverse for rendering.

```ts
// core/units/transform.ts
export interface AffinePxToMm {
  // row-major 2x3: [ a b c ; d e f ]  ->  x_mm = a*px + b*py + c;  y_mm = d*px + e*py + f
  a: number; b: number; c: number;
  d: number; e: number; f: number;
}
export function pxToMm(t: AffinePxToMm, p: PxPoint): MmPoint;
export function mmToPx(t: AffinePxToMm, m: MmPoint): PxPoint;   // uses analytic inverse; throws if singular
export function pxDistanceToMm(t: AffinePxToMm, a: PxPoint, b: PxPoint): number;
export function isUniform(t: AffinePxToMm, tolPct: number): boolean; // |sx - sy| / avg <= tolPct

export type PxPoint = { px: number; py: number };   // image pixel space, origin top-left
export type MmPoint = { xMm: number; yMm: number };  // board space
```

Calibration inputs, provenance, and the engine result:

```ts
// core/project/referenceAsset.ts
export type MeasurementSource = 'calipers' | 'datasheet' | 'ruler' | 'other';

export interface CalibrationLineInput {
  a: PxPoint; b: PxPoint;             // anchor pixel coords (never mm)
  measuredMm: number;                 // real distance
  source: MeasurementSource;
  uncertaintyMm?: number;             // optional +/- from the measuring tool
}

export interface CalibrationProvenance {
  lines: CalibrationLineInput[];      // 1 = uniform scale; 2 (perpendicular) = skew/anisotropy check
  createdAt: string; generatorVersion: string;
  method: 'uniform' | 'anisotropic';  // anisotropic requires user opt-in
}

export type CalibrationState =
  | { kind: 'uncalibrated' }
  | { kind: 'calibrated'; transform: AffinePxToMm; provenance: CalibrationProvenance;
      pxPerMm: number; anisotropyPct?: number; skewDeg?: number; warnings: CalibrationWarning[] }
  | { kind: 'rejected'; reason: RejectionReason; attempted: number /* px/mm */ };

export type RejectionReason =
  | 'implausible-scale'        // outside plausibility bounds
  | 'degenerate-line'          // anchors coincident / near-zero pixel distance
  | 'nonpositive-distance'     // measuredMm <= 0
  | 'not-perpendicular';       // second line too far from 90 deg to trust as an axis
```

Engine entry point — pure, returns a discriminated result, and **never mutates prior state on rejection**:

```ts
// core/units/calibration.ts
export function calibrate(input: CalibrationProvenance): CalibrationState;
// Uniform:  s = measuredMm / hypot(b.px-a.px, b.py-a.py)   [mm per px]; pxPerMm = 1/s
// Two-line: sx, sy from each line's projected pixel length; skewDeg = |90 - angleBetween(l1,l2)|
// Reject if pxPerMm outside PLAUSIBLE, or line degenerate, or distance <= 0.
```

Reference asset + storage seam:

```ts
export interface ReferenceAsset {
  id: string;                         // stable asset id
  kind: 'png' | 'jpeg' | 'svg' | 'pdf';
  widthPx: number; heightPx: number;  // intrinsic pixel dimensions (rasterized for svg/pdf)
  contentHash: string;                // sha-256 of stored (EXIF-stripped) bytes
  storage: { mode: 'indexeddb' | 'embedded' | 'referenced'; ref: string };
  exifStripped: true;                 // invariant: bytes at rest carry no EXIF
  capture?: { via: 'upload' | 'camera'; capturedAt?: string };
  calibration: CalibrationState;
}

export interface AssetStore {              // implemented over idb; no network
  put(bytes: Blob, meta: Omit<ReferenceAsset,'id'|'contentHash'>): Promise<ReferenceAsset>;
  get(id: string): Promise<Blob | null>;   // null => missing -> relink flow
  has(id: string): Promise<boolean>;
}
```

Plausibility bounds (candidate, tune with fixtures; owned by `core/units/plausibility.ts`):

```ts
export const PLAUSIBLE = { minPxPerMm: 0.5, maxPxPerMm: 120 } as const;
// 320 px/mm  -> rejected (implies ~0.003 mm per pixel: no board photo has that density).
// 0.1 px/mm  -> rejected (implies a 10mm feature spans 1 pixel).
```

## Phased Implementation Steps

Each step's Exit Evidence names an evidence class from `docs/workflows/BOARD_MOUNT_DESIGNER.md`
(host-level / browser-level / generated-geometry-level / printed-part-level).

1. **Affine transform + plausibility core.** Implement `AffinePxToMm`, `pxToMm`/`mmToPx`/`pxDistanceToMm`, uniform
   `calibrate`, and `PLAUSIBLE` bounds. Discriminated result with rejection reasons; no DOM.
   Exit Evidence (host-level): unit tests prove round-trip `mmToPx(pxToMm) === identity` within epsilon, a known line
   maps to expected mm within tolerance, and 320 px/mm returns `kind:'rejected'` without producing a transform.

2. **Rejection never overwrites prior state.** Wire the engine into a calibration store slice such that a `rejected`
   result leaves any existing `calibrated` transform intact and raises a validation error.
   Exit Evidence (host-level): test asserts a good calibration, then a rejected attempt, then reads back the original
   transform unchanged plus one blocking validation error.

3. **Raster upload + EXIF strip + local store.** File input for PNG/JPEG. Decode via `createImageBitmap`, re-encode
   through a canvas (`canvas.toBlob`) to drop all metadata; optionally read orientation with `exifr` before stripping so
   the image is drawn upright. Store bytes in IndexedDB (`idb`); record `contentHash`, `exifStripped:true`.
   Exit Evidence (browser-level): Playwright loads a fixture JPEG with known EXIF GPS; stored blob hashes differ from the
   original and an EXIF re-parse finds no tags.

4. **SVG and PDF-drawing ingest.** SVG parsed and rasterized to a chosen DPI (record the DPI as it defines the pixel
   grid); PDF drawings rendered via `pdfjs-dist` first page to a canvas at a chosen DPI. Both funnel into the same
   `ReferenceAsset` contract with `widthPx/heightPx` set from the rasterization.
   Exit Evidence (browser-level): a fixture SVG and a fixture single-page PDF each produce a `ReferenceAsset` with
   non-zero dimensions and render on the 2D canvas.

5. **Single-line calibration on canvas.** Calibration tool: place anchors A/B, type the measured distance, pick a
   `MeasurementSource`. Show `Uncalibrated` state and the amber banner from `docs/design/COMPONENT_SPEC.md` until scale
   exists; show px-only status readouts before calibration, mm only after.
   Exit Evidence (browser-level): drawing a line on a fixture at a known length and typing the distance flips status to
   `Measured` and reveals mm readouts matching within tolerance; an implausible distance shows the rejection banner and
   leaves state `Uncalibrated`.

6. **Second-line skew / anisotropy detection.** Optional perpendicular second line. Compute `anisotropyPct` and
   `skewDeg`; if beyond agreed thresholds, emit a **warning** (not an auto-correction) naming the number. Anisotropic
   correction is opt-in and marks the transform `method:'anisotropic'` and the result `Inferred`.
   Exit Evidence (host-level): fixtures with a deliberately non-square pixel grid produce the expected `anisotropyPct`;
   a near-90-degree pair yields no warning, an 86-degree pair yields a `skewDeg` warning.

7. **Camera capture with top-down guidance.** `getUserMedia({ video: { facingMode: 'environment' } })`, still-frame
   grab to canvas, same EXIF-free store path, a level/crosshair guidance overlay, and graceful permission-denied
   fallback to the file-input `capture` attribute. Capture must not block or regress the upload path (`ADR 0008` Phase 0).
   Exit Evidence (browser-level): mocked `getUserMedia` stream captures a frame into a `ReferenceAsset{ capture.via:'camera' }`;
   denied permission still leaves upload fully functional.

8. **Reference-missing recovery (relink).** On `AssetStore.get -> null`, keep the full semantic board definition and
   surface the `FileBox` "Not found" / Missing state from `docs/design/COMPONENT_SPEC.md`; offer relink by re-selecting a
   file, validating the new `contentHash`/dimensions against the stored record, and warning if they diverge.
   Exit Evidence (browser-level): deleting the stored blob then reopening the project shows the board data intact, a
   missing-image warning, and a working relink that restores the canvas without altering calibration provenance.

9. **Provenance persistence + migration hook.** Persist `CalibrationProvenance` (anchors, distances, source,
   uncertainty, method) in the project schema with a version tag; add a v1 fixture and a migration test stub aligned with
   `ADR 0007`.
   Exit Evidence (host-level): a saved project reopens with identical anchors/transform; a v1 fixture loads through the
   migration harness.

Deferred (needs `ADR 0008` scope expansion): homography/undistort from 4+ points; any service-assisted analysis.
Those remain `Future possibility` and are gated, not silently dropped.

## Failure Modes & Diagnostics

| Failure | Symptom | Diagnostic (never a bare "failed") |
|---|---|---|
| Implausible scale (e.g. 320 px/mm) | Rejection | `implausible-scale: 320 px/mm outside [0.5, 120]; prior calibration kept` |
| Degenerate line | Anchors coincident | `degenerate-line: pixel distance 0.4 px too small to trust` |
| Non-positive distance | User typed 0 or blank | `nonpositive-distance: measured distance must be > 0 mm` |
| Second line not perpendicular | Off-axis pair | `not-perpendicular: 62 deg between lines; cannot infer axis scales` |
| EXIF strip skipped | Bytes retain metadata | Invariant test fails at store boundary; block save until `exifStripped:true` |
| Orientation ignored | Sideways photo | Read EXIF orientation pre-strip; if unknown, leave upright and warn, never guess |
| Missing asset blob | Canvas empty on reopen | Missing chip + relink; semantic model preserved (unknown != deleted) |
| Relink mismatch | New file differs | Warn on hash/dimension divergence; require explicit accept before recalibrating |
| PDF/SVG DPI drift | Scale off after re-render | Persist rasterization DPI with the asset; recompute nothing silently |

Diagnostics render through the `ErrorReportBox` / `ValidationItem` contracts in `docs/design/COMPONENT_SPEC.md`, and each
error names the input that unblocks it.

## Testing & Evidence

- **Host-level (Vitest):** transform round-trip and inverse; uniform scale math; plausibility rejection at both bounds;
  rejection-preserves-prior-state; anisotropy/skew computation; provenance serialize/deserialize; migration fixture.
- **Browser-level (Playwright):** upload -> EXIF-free store; SVG/PDF ingest render; single-line calibrate to `Measured`;
  rejection banner leaves `Uncalibrated`; camera capture (mocked stream) and permission-denied fallback; relink recovery.
- **Fixtures:** a photo with known EXIF GPS; an image containing a printed ruler at a documented px/mm; a deliberately
  non-square-pixel image; a single-page PDF drawing; an SVG board outline. Store under `tests/fixtures/boards/`.
- **Generated-geometry-level / printed-part-level:** out of scope for this feature; calibration accuracy is only
  ultimately confirmed downstream via the STEP/Fusion gate and physical first-fit in `BOARD_MOUNT_DESIGNER_MVP_PLAN`
  Phases 7 and 9. This plan must not claim printed-part evidence.

## Open Decisions

All owned by `ADR 0008` unless noted:

- Embed vs local reference vs both, and the embed size threshold. (`ADR 0008` spike question 1.)
- Missing/moved-image warning copy and relink UX. (`ADR 0008` spike question 2.)
- Required provenance fields for typed, placed, and future inferred values. (`ADR 0008` spike question 3.)
- Privacy copy required before any future optional service-assisted analysis. (`ADR 0008` spike question 4; also
  `docs/ARCHITECTURE.md` Optional Assistance Boundary.)
- Camera capture in the first demo vs upload-first. (Open owner call in `BOARD_MOUNT_DESIGNER_MVP_PLAN`.)
- Final plausibility bounds and anisotropy/skew warning thresholds. (Tune against fixtures; record in `ADR 0008`.)
- Project schema shape and migration policy for `CalibrationProvenance`. (`ADR 0007`.)

## Risks & Counters

| Risk | Counter |
|---|---|
| Photo tilt produces confident-but-wrong scale | Uniform-only baseline; second line surfaces skew as a numbered warning; correction opt-in and marked `Inferred`. |
| EXIF leaks location if bytes are shared | Strip at the store boundary as an invariant; `exifStripped:true` gate blocks save otherwise; no upload path exists. |
| IndexedDB store lost between browsers/origins | `contentHash` + relink flow; embed-on-export option; semantic model never depends on blob presence. |
| Silent zero/one scale when uncalibrated | `CalibrationState` has an explicit `uncalibrated` kind; mm readouts withheld until `calibrated`; rejection never writes a transform. |
| Anisotropic correction over-trusted | Off by default, requires two perpendicular measured lines, tagged `Inferred`, warning always visible. |
| PDF/SVG rasterization drifts scale | Persist rasterization DPI with the asset; treat DPI as part of the pixel grid, recompute nothing silently. |
| Camera work delays the upload path | Camera built behind the shared `ReferenceAsset` contract after upload ships (`ADR 0008` Phase 0 posture). |
| Scope creep into perspective correction | Homography explicitly deferred behind an `ADR 0008` scope-expansion gate; a `BOARD_MOUNT_DESIGNER_MVP_PLAN` non-goal. |
