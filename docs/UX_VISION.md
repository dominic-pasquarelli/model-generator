---
title: UX Vision
tier: platform
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/design/UI_MOCKUPS.md
  - docs/REFERENCES.md
---

# UX Vision

## Status

This document is Direction unless a section explicitly says Ratified. It should guide design without pretending that a UI framework, layout, visual style, or implementation exists.

## Workspace Direction

The product shell should likely include:

- a local project and tool library;
- focused tool workspaces rather than one universal wall of controls;
- a primary 2D reference/editing surface;
- a synchronized 3D preview;
- a contextual parameter inspector;
- clear validation state and export readiness;
- a visible path back to the project/tool library.

The Gridfinity Layout Tool reference supports the principle that specialized 3D utilities can feel approachable while preserving precision. Model Generator should borrow that lesson, not the Gridfinity feature list, styling, assets, screenshots, or source.

## First-User Journey

1. Start a local project.
2. Choose Board Mount Designer.
3. Add a board image or drawing.
4. Calibrate a reference plane from known measurements.
5. Define the board outline.
6. Place mounting holes and enter real dimensions.
7. Mark keep-outs and clearances.
8. Fill in measurements the image cannot safely provide.
9. Choose a simple mount strategy.
10. Inspect synchronized 2D and 3D views.
11. Resolve validation errors and warnings.
12. Export the mount and save the reusable board definition.

## Interaction Principles

- Fast useful start for a basic mount.
- Visual placement plus exact typed editing.
- Progressive disclosure for advanced tolerances, interfaces, and constraints.
- Immediate preview with progress and cancellation for expensive generation.
- Undo, redo, autosave, and explicit reset boundaries.
- Invalid states that explain what is wrong, why it matters, and which input fixes it.
- Regeneration that preserves user-confirmed measurements and manual edits.
- Local utility first, with optional services kept behind explicit boundaries if later ratified.
- Standard escape hatches into full CAD workflows.
- Keyboard operation, visible focus, understandable units, adequate hit targets, and non-color-only state.

## State Vocabulary

Use these words precisely:

| State | Meaning |
|---|---|
| Uncalibrated | A reference exists but has no trustworthy physical scale. |
| Inferred | Suggested by image processing, geometry, defaults, or heuristics. Editable and not measured. |
| Measured | Entered from a known measurement source. |
| Confirmed | Reviewed and accepted by the user. |
| Generated | Derived from canonical project data. |
| Exported | Written to a supported output format with metadata. |
| Physically verified | Checked against a printed or assembled artifact with named setup. |

## Required Early States

The first real UX spike should cover empty project, missing image, uncalibrated image, invalid calibration, missing required dimensions, keep-out conflict, export not ready, export in progress, export failure, and export complete.

Static Direction mockups covering these states live in [Board Mount Designer UI Mockups](design/UI_MOCKUPS.md).

## What A Future Mock Must Not Promise

A mock, vision board, screenshot, or rendered model must not imply that:

- image recognition is automatic or accurate;
- dimensions can be trusted without calibration;
- export formats are selected;
- a geometry kernel is selected;
- cloud sync or AI assistance is required;
- physical fit has been validated;
- the visual style is locked.

