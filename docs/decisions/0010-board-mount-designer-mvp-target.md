---
title: ADR 0010 Board Mount Designer MVP Target
tier: decision
adr: 0010
status: accepted
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/ARCHITECTURE.md
---

# ADR 0010 - Board Mount Designer MVP Target

## Status

Accepted.

## Context

The owner selected the first MVP target: take a picture or reference image, draw the relevant board zones, generate a 3D model/bracket from it, and import that result into Fusion so the workflow can be refined into the full app later.

This is intentionally broad enough to shake down the major systems early: image/reference handling, calibration, manual zone definition, semantic project data, validation, geometry generation, 3D preview, export, Fusion import evidence, and persistence.

## Decision

The Board Mount Designer MVP targets this workflow:

1. add or capture a board photo/reference image;
2. calibrate scale from trusted measurements;
3. manually draw the board outline, mounting holes, and keep-out/clearance zones;
4. choose a simple bracket/mount strategy;
5. generate a 3D bracket from the canonical semantic model;
6. preview the derived model;
7. export a CAD file suitable for Fusion import;
8. save/reopen the reusable semantic board/mount definition.

STEP is the primary export success target for the MVP because the goal is CAD import and downstream refinement in Fusion. STL may be secondary but cannot satisfy the MVP by itself.

## Consequences

- Product implementation can start once the geometry/export spike and schema scope are written.
- ADR 0003 now selects the delivery posture; ADRs 0005, 0006, and 0007 remain open but answer to this MVP target.
- The first geometry path must prove Fusion import, not only visual rendering.
- The first UI must support manual drawing and exact values; automatic image recognition is not required.
- The modular bracket system remains a design concern, but exact slot dimensions are not ratified by this ADR.

## Evidence Required To Close MVP

- Local app can complete the workflow from reference image to generated bracket.
- STEP export imports into Fusion.
- Fusion dimensions and units match the source model within a named tolerance.
- Project save/reopen preserves semantic model facts.
- Validation prevents uncalibrated or under-specified geometry from being exported as trustworthy.
