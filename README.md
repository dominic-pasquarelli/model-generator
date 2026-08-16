# Model Generator

Model Generator is a modular design workbench that turns real-world references and a small set of trustworthy measurements into validated, reusable, exportable parametric models, reducing repetitive CAD setup without trying to replace general-purpose CAD.

## Current Status

This repository is in **foundation / pre-implementation** status. The product vision, first workflow, architecture boundaries, documentation model, and audit tooling are being established before application code, geometry kernels, export formats, or UI stacks are selected.

Nothing in this repository should be read as proof that a board can already be detected from an image, generated as geometry, exported, printed, or physically fitted.

## First Workflow

The first value slice is **Board Mount Designer**: a focused tool for making electronics board mounts from a board image or drawing plus user-supplied measurements. It should help define board outlines, mounting holes, keep-out zones, clearances, and mount parameters, then produce a preview and exportable geometry through a documented generation path.

The later **Board Mount Assembly** workflow should compose reusable board and mount definitions into larger electronics structures with stacking, header clearance, wire paths, power, ports, and serviceability. It is intentionally future scope until the first workflow has reusable semantic board definitions and physically validated mounts.

## What This Is Not

- Not a generic CAD replacement.
- Not a slicer or printer-control application.
- Not a promise that one photograph can produce accurate physical dimensions without calibration or measurements.
- Not an opaque one-click AI geometry generator.
- Not a mandatory cloud account, marketplace, or collaboration platform.
- Not a Gridfinity clone or a copy of Gridfinity Layout Tool code, assets, prose, or design.

## Start Here

- [Project vision](docs/PROJECT_VISION.md) explains the product thesis, goals, non-goals, and authority labels.
- [Board Mount Designer workflow](docs/workflows/BOARD_MOUNT_DESIGNER.md) defines the first buildable path.
- [Architecture](docs/ARCHITECTURE.md) defines conceptual sources of truth and unresolved technical choices.
- [NEXT](docs/NEXT.md) names the exact active resume anchor.
- [Onboarding](docs/ONBOARDING.md) lists the local documentation commands that exist today.

