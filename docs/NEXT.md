---
title: Next
tier: record
status: living
updated: 2026-08-19
audited: 2026-08-19
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/plans/GEOMETRY_GENERATION_PLAN.md
  - docs/plans/STEP_EXPORT_PLAN.md
  - docs/plans/PROJECT_SCHEMA_PERSISTENCE_PLAN.md
  - docs/plans/IMAGE_CALIBRATION_PLAN.md
  - docs/plans/TESTING_A11Y_CI_PLAN.md
---

# NEXT

## START HERE

The Board Mount Designer now **generates a real solid** and exports real files (see HISTORY 2026-08-19/2026-08-20). Verified host/browser level (129 unit tests + 9 Playwright cases pass; `tsc` and `vite build` clean; doc-audit passes). Run it with `pnpm install` then `pnpm dev`; check it with `pnpm test` and `pnpm exec playwright test`.

A dependency-free solid generator (`src/core/geometry/mesh.ts`, active `solidGenerator`) builds a **single connected, watertight, manifold** bracket from the canonical model — plate faces are triangulated with the standoff/bore/keep-out circles as holes and every feature shares welded vertices, so the whole artifact is one connected component (no boolean kernel). The live 3D preview, its dimension/warning readouts, and the STL (real print mesh) + STEP (real **faceted** B-rep, one `MANIFOLD_SOLID_BREP`) export all consume that same live build, so preview and export never disagree. Geometry is authored in **millimetres**; mm/inch is a display-only toggle. `.mgproj` save/open (validated as an untrusted boundary), version-monotonic undo/redo, and a full auditable parameter sidecar work. ADRs 0004 (canonical model), 0005 (kernel), 0006 (export), and 0007 (project file) are now Accepted.

The next blocking work is the **evidence gates the code cannot self-verify**: import the exported STEP into Autodesk Fusion and record `evidence/fusion-import/` (ADR 0006 gate), then a first printed-part fit. After that: automatic board detection from an image, and camera/skew-aware calibration. Follow [the STEP export plan](plans/STEP_EXPORT_PLAN.md) and [the image/calibration plan](plans/IMAGE_CALIBRATION_PLAN.md).

## Active Follow-Through

| Order | Work | Exit Condition | Evidence |
|---:|---|---|---|
| 1 | **Fusion import evidence gate** | ADR 0006 "usable in Fusion" row earned | Import exported STEP into Fusion; record `evidence/fusion-import/`; [plan](plans/STEP_EXPORT_PLAN.md) |
| 2 | First printed-part fit | A physical fit claim for one named board/printer/profile | Print + measure; validation notes |
| 3 | Automatic board detection from an image | Outline/hole candidates inferred (as `inferred`, user-confirmed) | Image-analysis boundary decision; [plan](plans/IMAGE_CALIBRATION_PLAN.md) |
| 4 | Camera capture + skew-aware calibration | ADR 0008 accepted or narrowed; second skew line + camera | [plan](plans/IMAGE_CALIBRATION_PLAN.md) |
| 5 | Test / a11y / CI system | Test matrix, keyboard-journey + contrast conformance, CI wired | [plan](plans/TESTING_A11Y_CI_PLAN.md) |
| 6 | Exact analytic B-rep (optional) | If faceted STEP proves insufficient downstream, OCCT-WASM behind the adapter | Analytic STEP evidence; ADR 0005 revisit |
| 7 | Modular mounting direction decision | Decide whether the first slice includes a standard attachment interface | Owner ruling, ADR, or spike plan |

**Done this sprint (2026-08-19):** real self-contained solid generator (ADR 0005 accepted), real STL + faceted-B-rep STEP export (ADR 0006 accepted, Fusion gate still open), live 3D preview of the actual solid, `.mgproj` save/open (ADR 0007 accepted), working mm/inch display, and undo/redo.

## Known Limitations (for the reviewer)

- The STEP is a **faceted** B-rep (curved standoff walls are facets, not analytic surfaces), and **Fusion import + printed-part fit are unverified** — no `evidence/fusion-import/` record exists yet. The export UI and sidecar say so.
- No **automatic board detection**: outline, holes, and keep-outs are drawn/typed by the user against the reference; nothing is inferred from image pixels.
- Calibration is a single user-placed line (isotropic scale); a second skew line and camera capture are not built.
- Reference images embed as data-URL `src` inside the `.mgproj` JSON — simple and self-contained, but large photos bloat the file (ADR 0007 open refinement).
- No CI yet, and the accessibility conformance pass (keyboard-journey + contrast) is not complete.

## Open Owner Decisions

- Repository license (ADR 0009).
- Whether image processing is local-only, optional service-assisted, or deferred (ADR 0008) — gates automatic board detection.
- Whether modular bracket/mounting interfaces are part of the first mount strategy or a second slice.
- Whether faceted STEP is sufficient downstream, or an exact analytic B-rep kernel (OCCT-WASM) is warranted (ADR 0005 revisit).

_Decided this sprint: geometry kernel (ADR 0005 accepted — self-contained mesh), export format (ADR 0006 accepted — real STL + faceted STEP, Fusion gate open), project file format and migration policy (ADR 0007 accepted — `.mgproj`)._

## Not Active

Board Mount Assembly is not active until its recall trigger in [BOARD_MOUNT_ASSEMBLY](workflows/BOARD_MOUNT_ASSEMBLY.md) fires.
