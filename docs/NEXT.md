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
---

# NEXT

## START HERE

Resume by opening [ADR 0003](decisions/0003-local-first-product-posture.md) and deciding whether the first implementation target is browser-first/PWA, desktop wrapper, or another posture. Do not start product code until this is either accepted or converted into a bounded spike.

## Active Foundation Follow-Through

| Order | Work | Exit Condition | Evidence |
|---:|---|---|---|
| 1 | Owner decision: delivery posture | ADR 0003 accepted or spike scoped | Owner ruling or spike plan |
| 2 | Geometry/export feasibility spike | ADRs 0005 and 0006 updated with measured options | Candidate matrix and small generated-geometry evidence |
| 3 | Canonical project-schema spike | ADRs 0004 and 0007 updated | Draft schema, unknown-vs-zero examples, migration fixture |
| 4 | Image/privacy boundary decision | ADR 0008 accepted or narrowed | Local/reference handling decision |
| 5 | First UX/workflow spike | Low-fidelity Board Mount Designer flow covers required states | UX artifact and usability notes |
| 6 | Modular mounting direction decision | Decide whether the first Board Mount Designer slice includes a standard attachment interface or keeps it deferred | Owner ruling, ADR, or spike plan |
| 7 | Physical-validation plan | First board, printer/material profile, and fit checks named | Validation plan document or ADR |
| 8 | Smallest implementation slice | A basic calibrated board outline and two mounting holes can save/load and validate | Host/UI tests appropriate to selected stack |

## Open Owner Decisions

- Delivery posture.
- Repository license.
- Geometry kernel.
- Export format expectations.
- Project file format and migration policy.
- Whether image processing is local-only, optional service-assisted, or deferred.
- Whether modular bracket/mounting interfaces are part of the first mount strategy or a second slice.

## Not Active

Board Mount Assembly is not active until its recall trigger in [BOARD_MOUNT_ASSEMBLY](workflows/BOARD_MOUNT_ASSEMBLY.md) fires.
