---
title: Next
tier: record
status: living
updated: 2026-08-17
audited: 2026-08-17
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

The Phase 1 app skeleton and the first interactive Board Mount Designer spike are now Built in `src/` (see HISTORY 2026-08-17) and Verified at browser and host level (26 unit tests + 6 Playwright cases pass; `tsc` and `vite build` clean). Run it with `pnpm install` then `pnpm dev`; check it with `pnpm test` and `pnpm exec playwright test`.

The shell ships a deterministic **illustrative** generator behind a real `GeometryAdapter` seam (`src/core/geometry/`); it is not a solid kernel and cannot emit a valid STEP. The next blocking work is the geometry/export spike: implement a real kernel behind that unchanged adapter, then produce a valid STEP and record the Fusion import evidence. Follow [the geometry generation plan](plans/GEOMETRY_GENERATION_PLAN.md) and [the STEP export plan](plans/STEP_EXPORT_PLAN.md), and update ADRs 0005 and 0006 with measured evidence.

This branch is ready for reviewer feedback on the shell.

## Active Follow-Through

| Order | Work | Exit Condition | Evidence |
|---:|---|---|---|
| 1 | Geometry kernel behind the adapter | ADR 0005 updated; a real solid replaces the mock generator | Generated-dimension checks against fixtures; [plan](plans/GEOMETRY_GENERATION_PLAN.md) |
| 2 | STEP export + Fusion gate | ADR 0006 updated with supported/unsupported claims | Valid STEP + `evidence/fusion-import/` result; [plan](plans/STEP_EXPORT_PLAN.md) |
| 3 | Hardened project schema + persistence | ADRs 0004 and 0007 updated; real file format + migrations replace localStorage drafts | Migration tests, corrupt-file handling; [plan](plans/PROJECT_SCHEMA_PERSISTENCE_PLAN.md) |
| 4 | Image/calibration robustness + privacy | ADR 0008 accepted or narrowed; camera + skew-aware calibration | Upload/reference handling decision; [plan](plans/IMAGE_CALIBRATION_PLAN.md) |
| 5 | Test / a11y / CI system | Test matrix, keyboard-journey + contrast conformance, CI wired | [plan](plans/TESTING_A11Y_CI_PLAN.md) |
| 6 | Modular mounting direction decision | Decide whether the first slice includes a standard attachment interface | Owner ruling, ADR, or spike plan |
| 7 | Physical-validation plan | First board, printer/material profile, and fit checks named | Validation plan document or ADR |

## Known Shell Limitations (for the reviewer)

- The 3D bracket, generated dimensions, and exported STEP/STL are illustrative/placeholder — no geometry kernel is wired, so `mockGenerator` reports `exactSolid: false` and export writes a real metadata sidecar plus a labelled placeholder body.
- The units toggle stores mm/inch on the project but inspector fields still render values in millimetres; full unit-aware display is deferred.
- Calibration uses fixed default anchors at the sample board's top holes; draggable anchors and a second skew line are planned, not built.
- Persistence is `localStorage` only; the real `.mgproj` file schema and migrations are planned.

## Open Owner Decisions

- Repository license.
- Geometry kernel.
- Export format expectations.
- Project file format and migration policy.
- Whether image processing is local-only, optional service-assisted, or deferred.
- Whether modular bracket/mounting interfaces are part of the first mount strategy or a second slice.

## Not Active

Board Mount Assembly is not active until its recall trigger in [BOARD_MOUNT_ASSEMBLY](workflows/BOARD_MOUNT_ASSEMBLY.md) fires.
