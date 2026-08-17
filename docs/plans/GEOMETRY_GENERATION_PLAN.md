---
title: Geometry Generation and Kernel Adapter Plan
tier: workflow
status: proposed
updated: 2026-08-17
audited: 2026-08-17
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0005-geometry-kernel-selection.md
---

# Geometry Generation and Kernel Adapter Plan

## Purpose And Scope

This plan specifies how the Board Mount Designer turns its canonical semantic model into a real
solid bracket: a plate/bracket body, standoffs at mounting holes, fastener bosses with fillets,
screw/insert bores, keep-out avoidance, and optional side tabs. It is a forward-looking spec with
`status: proposed`. Nothing here is Built or Verified; no code exists in `src/` yet, and the kernel
choice is owned and gated by `ADR 0005`.

The current shell ships (or will ship) a deterministic **illustrative mock generator** that emits a
placeholder mesh and dimensions so the UI, preview, and adapter seam can be exercised before a kernel
is chosen. That mock is not a solid and cannot produce STEP. This plan describes how a real kernel
replaces it behind an unchanged `GeometryAdapter` boundary. It maps to `BOARD_MOUNT_DESIGNER_MVP_PLAN`
Phase 5 (geometry adapter and generator) and feeds Phase 6 (preview) and Phase 7 (STEP/Fusion gate).

In scope: the adapter TypeScript interface, kernel candidates and their STEP-capability gate, the
deterministic boolean-generation algorithm, parameter hashing for reproducibility, worker offloading
with progress/cancel, and a boolean-failure taxonomy with diagnosable error codes.

Out of scope: STEP file writing and the Fusion import gate (owned by `ADR 0006` and Phase 7), the 3D
preview renderer internals (Phase 6), and the 2D editor that produces the semantic model (Phase 4).

## Where It Fits

The geometry service sits between the Shared Domain Core and the Preview/Export pipelines in the
Canonical Data Flow of `docs/ARCHITECTURE.md`. It is the "Geometry service" row: it owns deterministic
generation from semantic inputs and must not own product meaning that cannot be reconstructed from the
canonical model. The proposed home is `src/geometry/adapter/` (the boundary) and
`src/geometry/boardMount/` (the deterministic recipe), per the repository shape in the MVP plan.

The seam is a single interface, `GeometryAdapter`. The shell depends only on that interface. The mock
implementation, the real kernel implementation, and any future kernel all satisfy it. Kernel handles
and scene objects never become the only durable representation of project meaning: the canonical model
plus the recorded parameters and `paramsHash` are always sufficient to regenerate.

Preview and export both consume the adapter's output — the same `SolidHandle` produces both the preview
mesh and (in Phase 7) the STEP. This satisfies the architecture rule "Preview and export must derive
from the same canonical model or a documented shared geometry path."

## Candidate Approaches

The candidates below refine the `ADR 0005` Phase 0 matrix into concrete libraries. The decision is not
final; `ADR 0005` owns ratification after the spike records evidence.

| Candidate | Library / API | Solid + STEP | Browser (WASM) | Worker-friendly | License | Key Risk |
|---|---|---|---|---|---|---|
| OCCT WASM | `opencascade.js` (Open CASCADE Technology, BRep) | Yes exact BRep, native STEP via `STEPControl_Writer` | Yes (~30-40 MB WASM) | Yes, but large transfer | LGPL-2.1 (OCCT) | Bundle size, startup cost, memory ceiling |
| Replicad | `replicad` (wraps `opencascade.js`) | Yes (inherits OCCT STEP) | Yes | Yes | MIT wrapper over LGPL OCCT | Same OCCT weight; thinner API surface for edge cases |
| Manifold | `manifold-3d` (mesh CSG, guaranteed-manifold) | Mesh only, no native STEP | Yes (~2-4 MB WASM) | Yes, fast, small | Apache-2.0 | Cannot satisfy STEP gate alone; mesh -> STEP is lossy |
| Local helper | Rust (`truck`, `fornjet`-style) or C++ OCCT via Electron IPC | Yes exact + STEP | No (desktop only) | Native threads | Per-crate; OCCT LGPL | Desktop packaging, install burden, hidden service dependency |

Decision gates:

- **STEP-capability gate (blocking for MVP).** A candidate that cannot emit STEP for the `ADR 0005`
  fixture bracket cannot be the sole MVP kernel, because `ADR 0006` names STEP the CAD evidence target.
  `manifold-3d` fails this gate on its own and is retained only as a fast preview/diagnostic path or a
  robustness fallback for boolean-heavy previews.
- **Browser-viability gate.** If OCCT WASM startup or memory proves impractical on the target machine,
  the Electron/local-helper path in `ADR 0003` is the accepted escape hatch. The adapter interface does
  not change; only the implementation moves behind IPC.
- **Determinism gate.** The same `model` must yield byte-identical dimensions and an identical
  `paramsHash` across runs and machines. A candidate with nondeterministic boolean ordering or
  floating tessellation seeds fails unless determinism can be pinned.

Recommended spike order (proposed, `ADR 0005` decides): try `replicad`/`opencascade.js` first because
it clears the STEP gate in-browser; keep `manifold-3d` wired as the preview-robustness fallback; hold
the Electron OCCT helper as the documented fallback if browser OCCT fails the viability gate.

## Data And Interface Contracts

The adapter interface the shell already needs. Kernel handles are opaque; the canonical model plus
parameters remain the source of truth.

```ts
// src/geometry/adapter/GeometryAdapter.ts

export interface GeometryAdapter {
  readonly id: string;            // e.g. "mock-illustrative", "occt-wasm", "manifold"
  readonly capabilities: {
    exactSolid: boolean;          // true => can back STEP export
    stepExport: boolean;          // gate flag for ADR 0006 Phase 7
    meshPreview: boolean;
  };
  generate(model: BoardMountModel, opts?: GenerateOptions): Promise<GenerateResult>;
}

export interface GenerateOptions {
  signal?: AbortSignal;                       // cancel a running generation
  onProgress?: (p: Progress) => void;         // 0..1 plus current stage
  deflection?: number;                        // mesh tessellation tolerance, mm
}

export interface Progress { fraction: number; stage: GenerationStage; }

export type GenerationStage =
  | "base-plate" | "standoffs" | "boss-fillets" | "bores"
  | "keepout" | "tabs" | "tessellate" | "measure";

export interface GenerateResult {
  solid: SolidHandle;             // opaque kernel handle; NOT persisted as truth
  mesh: PreviewMesh;              // derived triangles for the preview scene only
  dimensions: GeneratedDimensions;
  warnings: GeometryWarning[];
  paramsHash: string;             // sha-256 over normalized generation inputs
  generatorVersion: string;       // matches package build for provenance
}

export interface SolidHandle { readonly kernelId: string; readonly ref: unknown; dispose(): void; }

export interface PreviewMesh {
  positions: Float32Array;        // xyz triplets, millimeters
  normals: Float32Array;
  indices: Uint32Array;
  bbox: BoundingBoxMm;
}

export interface GeneratedDimensions {
  bbox: BoundingBoxMm;
  plateThicknessMm: number;
  standoffHeightsMm: number[];    // per standoff, order matches model.holes
  boreDiametersMm: number[];
  bodyCount: number;
}

export interface GeometryWarning {
  code: GeometryWarningCode;      // see failure taxonomy
  message: string;
  entityIds: string[];            // holes/zones from the canonical model
  severity: "error" | "warning" | "info";
}
```

`paramsHash` inputs (normalized, unit-fixed, key-sorted before hashing) so preview, export, and a
reopened project can prove they describe the same generation:

```ts
interface HashInput {
  schemaVersion: string;
  boardOutlineMm: number[][];         // rounded to 1e-4 mm to kill float noise
  holes: { id: string; xMm: number; yMm: number; diaMm: number; type: string }[];
  keepOuts: { id: string; shape: string; ptsMm: number[][]; clearanceMm: number }[];
  strategy: { standoffHeightMm: number; baseMm: number; wallMm: number;
              fastener: string; toleranceMm: number; tabs: TabSpec[] | null };
  generatorVersion: string;
}
```

## Phased Implementation Steps

1. **Freeze the adapter seam against the mock.** Land `GeometryAdapter`, `GenerateResult`, and the
   `paramsHash` normalizer with the existing illustrative mock as the first implementation. No kernel
   yet. *Exit Evidence (host-level): unit tests assert the mock returns stable `paramsHash` for a fixed
   fixture and a different hash when any measured value changes.*

2. **Kernel spike behind the seam.** Add `occt-wasm` (via `replicad`/`opencascade.js`) as a second
   `GeometryAdapter` producing a real solid for the `ADR 0005` two/four-hole fixture. Compare bounding
   box, hole center distances, hole diameters, standoff height, and base thickness against expected
   values. *Exit Evidence (generated-geometry-level): dimension assertions pass within named tolerance;
   evidence recorded and `ADR 0005` updated.*

3. **Implement the deterministic boolean recipe** in `src/geometry/boardMount/` in fixed order:
   base plate (from board outline or bounding rectangle, extruded to base thickness) -> standoff
   cylinders unioned at each hole center to standoff height -> boss fillets on standoff/plate edges ->
   screw/insert bores subtracted (diameter from fastener + tolerance) -> keep-out subtraction or
   documented avoidance -> optional side tabs unioned last. *Exit Evidence (generated-geometry-level):
   feature-count and per-feature dimension tests for each stage on the fixture.*

4. **Keep-out avoidance semantics.** Implement the chosen resolution (subtract the keep-out volume from
   the plate, or refuse-and-warn when subtraction would breach minimum wall/base thickness). Never
   silently clip below `wallMm`. *Exit Evidence (generated-geometry-level): a fixture with a hole-near
   keep-out produces either a clean subtracted body or a blocking `GeometryWarning` with the offending
   `entityIds`.*

5. **Worker offloading.** Move generation into a Web Worker; transfer `PreviewMesh` typed arrays via
   transferables; wire `AbortSignal` to a cooperative cancel checked between stages; emit `Progress`
   per `GenerationStage`. *Exit Evidence (browser-level): a smoke test cancels an in-flight generation
   and confirms the main thread never blocks and no stale mesh is applied.*

6. **Failure taxonomy and error codes.** Map kernel boolean failures to the taxonomy below with
   `entityIds` and parameters attached. *Exit Evidence (host-level): fault-injected fixtures (zero-radius
   bore, overlapping keep-out, degenerate outline) each produce the expected coded error.*

7. **STEP-capability probe (hand-off to Phase 7).** Confirm the OCCT adapter can serialize the fixture
   solid to STEP in millimeters; defer the Fusion import gate to `ADR 0006`. *Exit Evidence
   (generated-geometry-level): a STEP file is produced and re-read for body count and bbox; the
   printed-part-level claim remains explicitly unproven until Phase 9.*

## Failure Modes And Diagnostics

Boolean and tessellation failures must be diagnosable, not silent. Proposed error codes:

| Code | Cause | Diagnostic payload |
|---|---|---|
| `GEO_NON_MANIFOLD` | Result has non-manifold edges (shared by >2 faces) | edge locations, contributing feature ids |
| `GEO_SELF_INTERSECT` | Self-intersecting shell after a union/cut | intersecting face pair, stage |
| `GEO_ZERO_THICKNESS` | Seam thinner than `wallMm`/`baseMm` after a cut | measured min thickness, zone/hole ids |
| `GEO_BORE_ESCAPES_STANDOFF` | Bore diameter + tolerance exceeds standoff wall | bore dia, standoff outer dia, hole id |
| `GEO_KEEPOUT_BREACH` | Keep-out subtraction would breach base/wall minimum | keep-out id, remaining thickness |
| `GEO_DEGENERATE_OUTLINE` | Outline self-intersects or has < 3 distinct points | offending polygon indices |
| `GEO_BOOLEAN_FAILED` | Kernel boolean returned no valid shape | stage, operand ids, kernel message |
| `GEO_TESSELLATION_FAILED` | Meshing failed at given deflection | deflection value, face id |

Every code carries the offending canonical `entityIds` so the editor can highlight the exact hole or
zone. Codes surface as `GeometryWarning` (severity `error` blocks preview/export). Unknown geometry
state is reported as a blocking error, never rendered as an empty-but-valid body.

## Testing And Evidence

Evidence ladder mapping (from `docs/workflows/BOARD_MOUNT_DESIGNER.md`):

- **host-level:** `paramsHash` determinism, hash sensitivity, taxonomy mapping via fault-injected
  fixtures, normalizer rounding. Pure functions, no kernel required (mock adapter suffices).
- **browser-level:** worker progress/cancel smoke test; regeneration after a semantic edit yields a new
  `paramsHash` and a non-empty mesh.
- **generated-geometry-level:** per-stage dimension assertions on the `ADR 0005` fixture (bbox, hole
  center distances, bore diameters, standoff heights, body count) against expected values.
- **printed-part-level:** deferred to `BOARD_MOUNT_DESIGNER_MVP_PLAN` Phase 9; explicitly unproven here.

Fixtures reuse the `ADR 0005` Phase 0 synthetic rectangular board (two-to-four holes, one keep-out that
forces a warning or an adjusted feature). Golden dimensions live beside the fixture and are asserted
within a named tolerance (proposed 0.01 mm on linear dimensions).

## Open Decisions

- Kernel family and STEP path: `ADR 0005` (proposed). This plan recommends OCCT-WASM-first with a
  `manifold-3d` preview fallback and an Electron OCCT helper as the documented escape; the measured
  choice is owned by `ADR 0005`.
- STEP export contract, metadata, and the Fusion import gate: `ADR 0006` (proposed).
- Keep-out resolution policy (subtract vs refuse-and-warn as default): raise to `ADR 0005` with fixture
  evidence before ratifying a default.
- Standoff/boss default geometry (outer diameter, fillet radius, boss vs plain standoff): an Open Owner
  Call in `BOARD_MOUNT_DESIGNER_MVP_PLAN`; keep as an explicit parameter, not a hidden default.

## Risks And Counters

| Risk | Counter |
|---|---|
| OCCT WASM bundle/startup too heavy for browser MVP | Lazy-load in worker; if it fails the viability gate, move OCCT behind the `ADR 0003` Electron helper without changing the adapter seam. |
| Booleans become brittle on real outlines | Fixed operation order; per-stage dimension tests; coded failures with `entityIds`; start with the simple plate-plus-standoff strategy from the MVP plan. |
| Nondeterministic output breaks preview/export parity | `paramsHash` over normalized, rounded inputs; determinism gate in the spike; identical `SolidHandle` feeds both preview and STEP. |
| Mesh-only fallback mistaken for CAD success | `capabilities.stepExport` gate; `manifold-3d` marked preview/diagnostic only; STEP claims deferred to `ADR 0006`. |
| Kernel handle treated as the durable model | Handles are opaque and disposable; canonical model plus `paramsHash` always regenerate the solid. |
| Long generation freezes the UI | Worker offload with transferables, `Progress` per stage, and cooperative `AbortSignal` cancel. |
