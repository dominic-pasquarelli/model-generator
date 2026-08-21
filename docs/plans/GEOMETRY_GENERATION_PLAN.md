---
title: Geometry Generation and Kernel Adapter Plan
tier: workflow
status: living
updated: 2026-08-21
audited: 2026-08-21
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0005-geometry-kernel-selection.md
---

# Geometry Generation and Kernel Adapter Plan

> **Status update (2026-08-21).** This plan is now a `living` record split into three layers.
>
> **Current (Built + Verified host-level).** A **self-contained TypeScript mesh solid generator** produces the geometry (`src/core/geometry/mesh.ts` — `buildBracketMesh`; **ADR 0005 Accepted**). It builds a real watertight solid that is a **single connected, closed manifold** — plate + bored standoffs + optional side tabs welded into ONE body, proven fail-closed by an aggregate audit (one component, every edge shared by exactly two oppositely-oriented triangles, single manifold vertex fans, positive volume). One **keyed build service** owns generation: the store drives a **Web Worker** (`geometryWorker.ts` via `buildClient.ts`) that runs `buildBracketMesh` off the main thread and caches the immutable result under the canonical **generation key**, and the live 3D preview, semantic **validation** (which never runs the kernel), and both exporters all consume that ONE cached build — the mesh is not rebuilt synchronously per consumer. Cancellation is a real `AbortSignal` → `terminate()` hard stop of the in-flight build (Step 5, Built), and STL/STEP **serialization + artifact hashing** run off-thread as a separate cancellable job with real per-stage progress (`exportWorker.ts` via `exportClient.ts`). **Keep-outs are enforceable constraints** with typed resolution (honored-by-subtraction / satisfied-no-material / blocked / unsupported-semantic) that fail generation closed rather than silently skipping (Step 4, Built). Coded failure taxonomy (Step 6) is Built. This satisfies the plan's Steps 1, 3–6 via the mesh path.
>
> **Deferred.** The **exact analytic B-rep kernel** (OCCT/replicad, Step 2) and the **analytic** STEP-capability probe (Step 7) are not built; the shipped STEP is a FACETED B-rep (ADR 0006), not analytic surfaces. The Autodesk Fusion import evidence gate and printed-part fit remain unproven (ADR 0006).
>
> **Historical.** The sections below are the original forward-looking spec for the analytic-kernel path, retained for provenance. Where they say "no code exists yet" or describe a multi-body kernel handle, read them against the Current layer above — the shipped generator is the single-manifold mesh path, not an OCCT handle.

## Purpose And Scope

This plan specifies how the Board Mount Designer turns its canonical semantic model into a real
solid bracket: a plate/bracket body, standoffs at mounting holes, fastener bosses with fillets,
screw/insert bores, keep-out avoidance, and optional side tabs. The **mesh path described in the
Current layer above is Built and Verified host-level**; the **analytic-kernel path described in the
rest of this document is Deferred** and remains owned and gated by the (now Accepted) `ADR 0005`.

The shipped generator is the self-contained mesh solid generator (`buildBracketMesh`, Current layer),
run through ONE keyed worker-backed build service (`geometryWorker.ts` + `buildClient.ts`) whose
immutable result is cached by generation key and shared by preview, validation, and export. (The
earlier illustrative mock and the thin `GeometryAdapter`/`solidGenerator`/`workerGenerator` wrappers
were removed once the store owned the keyed build directly — tests inject a `BuildFn` seam instead.)
This plan describes how an exact analytic kernel could later replace the mesh generator behind the
same unchanged `MeshResult` build contract. It maps to `BOARD_MOUNT_DESIGNER_MVP_PLAN` Phase 5
(geometry generator) and feeds Phase 6 (preview) and Phase 7 (STEP/Fusion gate).

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

5. **Worker offloading. (Built.)** ONE keyed build service runs the full `buildBracketMesh` in a
   dedicated Web Worker (`geometryWorker.ts` via `buildClient.ts`), keyed by the canonical generation
   key and cached in the store so preview, validation, and export share the SAME build instead of each
   recomputing the mesh on the main thread; a real `AbortSignal` wired to `worker.terminate()` gives a
   hard cancel, superseding edits hard-cancel older in-flight builds, and the worker is built lazily
   with a synchronous fallback only where Workers are absent. STL/STEP serialization + artifact hashing
   run off-thread as a separate cancellable job (`exportWorker.ts` via `exportClient.ts`) that streams
   real per-stage progress (build → serialise → hash), not a synthetic timer. Transferables remain
   deferred (the immutable build is structure-cloned; correct and simple for a bounded mesh).
   *Exit Evidence (browser-level, Built): an e2e responsiveness gate imports an oversized file and
   confirms the tab stays responsive; the store cancels an in-flight generation via the AbortSignal
   and attaches no stale result; a unit integration test proves ONE build per key is shared by
   preview + generation and reused across an unchanged key.*

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

- `ADR 0005` is **Accepted**: the self-contained faceted mesh generator is the ratified kernel. The
  analytic-kernel options below (OCCT-WASM-first, `manifold-3d` preview fallback, Electron OCCT helper)
  are a **future reconsideration**, not an open ADR 0005 vote — adopting one would be a new decision.
- STEP export contract, metadata, and the Fusion import gate: `ADR 0006` (**Accepted** for the faceted
  contract; the Fusion import evidence gate remains the open blocker).
- Keep-out resolution policy: **Decided and Built** — keep-outs are enforceable constraints (subtract a
  bottom-side footprint that reaches the plate, satisfy trivially when no material is present, or fail
  closed as blocked/unsupported). Never silently skipped.
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
