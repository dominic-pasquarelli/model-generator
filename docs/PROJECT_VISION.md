---
title: Project Vision
tier: meta
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/workflows/BOARD_MOUNT_ASSEMBLY.md
  - docs/decisions/0001-project-scope-and-modular-toolbox.md
---

# Project Vision

## Thesis

**Model Generator is a modular design workbench that turns real-world references and a small set of trustworthy measurements into validated, reusable, exportable parametric models, reducing repetitive CAD setup without trying to replace general-purpose CAD.**

## Why This Exists

The owner-confirmed seed is a toolbox for recurring modeling inconveniences. The first concrete inconvenience is electronics board mounting: turning a board image or drawing, mounting holes, keep-out zones, and a few reliable measurements into a bracket or mount that can be visualized, exported, and refined in downstream modeling software.

This project should bank value one tool at a time. A finished Board Mount Designer is a complete useful deliverable even if later assembly tools never ship.

## Prototype-To-Service Direction

Owner-confirmed direction: the larger product should help move from proof of concept to in-service projects faster. A useful path is a modular bracket and mounting system that can be printed quickly, stay rigid enough for real use, and mount directly into final parts or enclosures. This would let a maker move from breadboard/prototype to functional deployment, then upgrade or refine later without throwing away the mounting concept.

This does not ratify the owner's older Gen 1 dimensions or slot geometry as the Model Generator standard. Those notes are historical input captured in [INBOX](INBOX.md). The product implication is stronger than the exact geometry: Board Mount Designer and later assembly work should preserve attachment interfaces, hardware choices, and modular mounting constraints as semantic facts instead of reducing them to anonymous meshes.

## Primary User

The first user is the owner/maker designing electronics mounts, brackets, internal structures, and enclosures. The architecture should not prevent later usefulness to other makers or small engineering workflows, but the first workflow should not be diluted for hypothetical audiences.

## Authority Labels

| Label | Meaning |
|---|---|
| Owner-confirmed | Directly stated in the seed README or owner assignment. Treat as project direction. |
| Ratified | Recorded in an Accepted ADR or explicit owner ruling. Governing until superseded. |
| Direction | A product or interface target worth designing toward, not a detailed implementation contract. |
| Proposed | A concrete recommendation awaiting owner decision or evidence. |
| Experiment | A hypothesis requiring a spike, measurement, or user test before adoption. |
| Future possibility | Outside active scope and kept alive by a recall trigger. |
| Built | Present in code and supported by evidence. |
| Verified | Proven by named evidence. State the evidence class. |

Evidence classes include host-level checks, browser-level checks, generated-geometry-level checks, printed-part-level checks, and physical assembly-level checks.

## Confirmed Workflows

| Workflow | Status | Role |
|---|---:|---|
| Board Mount Designer | Owner-confirmed / first value slice | Create reusable board and mount definitions from references plus measurements. |
| Board Mount Assembly | Future possibility | Compose board/mount definitions into larger electronics pods or internal structures. |
| Modular bracket/mounting system | Direction | Create quickly printable, rigid, reusable mounting interfaces that can move from prototype to final parts. |

## Goals

1. Reduce repetitive CAD setup for common maker and electronics modeling work.
2. Keep focused tools useful on their own.
3. Combine direct manipulation with exact numerical editing.
4. Make uncertainty visible: uncalibrated, inferred, measured, confirmed, generated, and verified are different states.
5. Keep previews immediate and honest.
6. Preserve semantic definitions rather than collapsing meaning into opaque meshes.
7. Produce interoperable output through documented formats once evidence supports those formats.
8. Support future composition through semantic interfaces and constraints.
9. Keep the simple path simple.
10. Preserve an advanced path into full CAD workflows.
11. Treat physical evidence as the final authority for fit claims.
12. Remain resumable and auditable across bursty work.

## Non-Goals

| Non-goal | Status |
|---|---:|
| Replacing general-purpose CAD | Ratified by ADR 0001 |
| Becoming a slicer or printer-control application | Proposed |
| Claiming one photograph can yield accurate physical dimensions without calibration or measurements | Ratified by ADR 0001 |
| Hiding all geometry behind an opaque one-click or AI-only generation path | Direction |
| Requiring a cloud account before local project creation and export are useful | Proposed |
| Building every conceivable generator before the first one is physically useful | Ratified by ADR 0001 |
| Duplicating units, coordinate transforms, persistence, geometry, or export logic inside every tool | Ratified by ADR 0001 |
| Treating a beautiful preview as evidence that a part is printable, editable, or physically correct | Ratified by ADR 0002 |

## Product Stages

| Stage | Status | Exit Evidence |
|---|---:|---|
| Foundation | Built in this branch | Docs, ADRs, generated map, audit tool, and baseline audit pass. |
| Workflow spike | Next | Low-fidelity Board Mount Designer flow with empty, invalid, warning, preview, and export states. |
| Geometry/export feasibility | Proposed | Kernel and export candidates measured against board mount needs. |
| Project schema | Proposed | Versioned semantic file model with migration tests. |
| First implementation slice | Future | Basic calibrated board outline, mounting holes, validation, preview, save/load, and one supported export. |
| Physical validation | Future | Printed or fabricated board mount checked against named board, printer/material profile, and tolerance notes. |

## Candidate Success Measures

These targets are Proposed until measured:

- Time to first valid basic board mount.
- Number of manual CAD setup steps removed.
- Reuse of one board definition across multiple mount strategies.
- Export success rate into the selected downstream CAD or fabrication path.
- Physical first-fit rate for simple board mounts.
- Error recovery time after invalid calibration, missing measurements, or keep-out conflicts.

## Open Owner Decisions

- Product posture is accepted in ADR 0003: Cadence-adjacent browser-first stack with Electron-compatible path.
- Canonical project-file format and migration policy.
- Geometry kernel and export format expectations.
- Image/reference processing and privacy boundary.
- Repository license and third-party-code policy.
- First physical-validation fixture strategy.
