---
title: ADR 0008 Image Processing And Privacy Boundary
tier: decision
adr: 0008
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/UX_VISION.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0008 - Image Processing And Privacy Boundary

## Status

Proposed. Owner decision needed.

## Question

How should board images and drawings be handled, and may optional analysis services inspect them?

## Proposed Rule

Start from a local-reference mental model. Image analysis may suggest features, but suggestions remain inferred until the user confirms or measures them. No service upload should be required for the basic local workflow unless explicitly ratified.

## Open Decisions

- local-only processing versus optional service assistance;
- whether board images are embedded, referenced, or both;
- privacy language for any future upload;
- provenance required for inferred features.

## Phase 0 Starting Posture

Start with local image upload/reference handling. Browser camera capture may remain in the UI direction, but it should not block the first working upload/calibration path.

For the first implementation slice:

- image files are selected locally;
- calibration, outline, holes, and keep-outs are manually entered or drawn;
- any suggested feature is `Inferred` until reviewed or measured;
- missing image files should not destroy the semantic board definition;
- no service upload, account, telemetry, or AI analysis is required for local project creation, calibration, generation, or export.

## Spike Questions

- Should the project file embed small reference images, store local relative references, or support both?
- What user-facing warning appears when a referenced image moves or is missing?
- What provenance fields are required for manual placement, typed measurement, and future inferred suggestions?
- What privacy copy is required before any future optional service-assisted analysis can exist?

