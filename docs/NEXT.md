---
title: Next
tier: record
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
---

# NEXT

## START HERE

Resume from [the Board Mount Designer MVP plan](plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md), Phase 0. ADR 0003 is now Accepted: use a Cadence-adjacent React/Vite/TypeScript browser-first stack with an Electron-compatible path. The next blocking work is the geometry/export decision packet for STEP/Fusion evidence.

## Active Foundation Follow-Through

| Order | Work | Exit Condition | Evidence |
|---:|---|---|---|
| 1 | Geometry/export decision packet | ADRs 0005 and 0006 updated with measured spike plan for STEP/Fusion | Candidate matrix and spike scope |
| 2 | Canonical project-schema spike | ADRs 0004 and 0007 updated | Draft schema, unknown-vs-zero examples, migration fixture |
| 3 | Image/privacy boundary decision | ADR 0008 accepted or narrowed | Local/reference handling decision |
| 4 | Phase 1 app skeleton | Cadence-adjacent React/Vite/TS shell runs locally with Board Mount Designer only | Local dev/test commands |
| 5 | First UX/workflow spike | Low-fidelity Board Mount Designer flow covers required states | UX artifact and usability notes |
| 6 | Modular mounting direction decision | Decide whether the first Board Mount Designer slice includes a standard attachment interface or keeps it deferred | Owner ruling, ADR, or spike plan |
| 7 | Physical-validation plan | First board, printer/material profile, and fit checks named | Validation plan document or ADR |

## Open Owner Decisions

- Repository license.
- Geometry kernel.
- Export format expectations.
- Project file format and migration policy.
- Whether image processing is local-only, optional service-assisted, or deferred.
- Whether modular bracket/mounting interfaces are part of the first mount strategy or a second slice.

## Not Active

Board Mount Assembly is not active until its recall trigger in [BOARD_MOUNT_ASSEMBLY](workflows/BOARD_MOUNT_ASSEMBLY.md) fires.
