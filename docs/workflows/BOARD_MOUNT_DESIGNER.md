---
title: Board Mount Designer Workflow
tier: workflow
tool: board-mount-designer
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/UX_VISION.md
  - docs/ARCHITECTURE.md
  - docs/TOOL_SPEC.md
---

# Board Mount Designer Workflow

## Status

Board Mount Designer is the first owner-confirmed value slice. This document is a workflow contract for future implementation, not a claim that the tool is built.

## Intended Outcome

The user should be able to create a reusable board definition and a generated mount from a board reference image or drawing plus trustworthy measurements. The output should be inspectable, validated, saved, and exported through supported formats once those formats are decided.

The workflow should also leave room for prototype-to-service mounting: a board mount may need standard attachment interfaces, screw or insert patterns, tab features, bracket locks, or modular slots that make the generated part useful in both quick prototypes and final enclosures.

## Minimum User Journey

1. Create or open a local project.
2. Choose Board Mount Designer.
3. Add a board reference image or drawing.
4. Establish a reference plane and calibrate it with one or more known measurements.
5. Define or refine the board outline.
6. Place mounting holes and enter their real dimensions.
7. Mark keep-out regions and required clearances.
8. Enter measurements the image cannot safely supply.
9. Choose a basic mount strategy or starter template.
10. Inspect synchronized 2D and 3D views.
11. Resolve validation errors and review warnings or remaining uncertainty.
12. Export the mount and save the reusable board definition.

## First-Slice Data Candidates

- board identity and optional revision;
- source image/reference asset and provenance;
- calibration anchors and scale;
- board outline;
- board thickness;
- mounting-hole centers, diameters, and types;
- keep-out areas or volumes;
- basic clearance/tolerance settings;
- mount strategy parameters;
- optional modular attachment interfaces;
- hardware choices such as screws, inserts, or magnets when selected;
- generated result and export metadata.

## Later Board-Definition Extensions

- component height envelopes;
- connector/header envelopes;
- port location and access direction;
- cable bend and service envelopes;
- heat/airflow regions;
- fastener and insert choices;
- board-side and enclosure-side attachment interfaces;
- slot, tab, bracket-lock, or modular grid compatibility;
- breadboard/prototype adapter relationships;
- confidence or uncertainty per captured fact;
- physical-fit corrections tied to board revision and printer/material profile.

Missing data means unknown or not captured. It does not mean zero.

## Correctness Rules

- Pixel coordinates are never millimeters until calibration establishes a transform.
- User-entered or measured facts remain traceable to their source.
- Inferred values must be marked as inferred and remain editable.
- Preview and export must derive from the same canonical model or documented shared geometry path.
- Unit conversions and coordinate systems are centralized and tested.
- Clearances and tolerances are explicit parameters, not unexplained constants.
- Modular interface dimensions are selected standards or user-defined parameters, not hidden defaults copied from old notes.
- Export reports what was generated, with which parameters, and with which project/schema version.
- The app fails clearly when it cannot produce a trustworthy result instead of silently inventing geometry.

## Validation Classes

| Severity | Meaning | Example |
|---|---|---|
| Error | Blocks generation or export. | No calibration, missing hole diameter, invalid outline. |
| Warning | Allows progress but requires user judgement. | Inferred hole position, unusually small clearance. |
| Info | Context or recall prompt. | Export format limitation, unverified physical fit. |

## Evidence Ladder

| Claim | Evidence Needed |
|---|---|
| Workflow documented | This document plus audit pass. |
| Domain model valid | Host-level fixtures for units, transforms, unknown values, and validation. |
| Editor usable | Browser-level interaction test or equivalent. |
| Geometry valid | Generated-geometry-level checks for dimensions and format-specific validity. |
| Export usable | Import or round-trip evidence in a named downstream CAD/fabrication path. |
| Mount fits | Printed-part-level or physical assembly-level evidence. |

## Open Questions

- Which delivery posture should host the first editor?
- Which geometry kernel supports the needed exact/editable output?
- Which export formats are supported in the first slice?
- What is the minimum project schema for board definitions?
- What is the first physical-validation fixture?
- Should a modular bracket/mounting interface be part of the first mount strategy or deferred until after a basic board mount is physically validated?
