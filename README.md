# Model Generator

Model Generator is a modular design workbench that turns real-world references and a small set of trustworthy measurements into validated, reusable, exportable parametric models, reducing repetitive CAD setup without trying to replace general-purpose CAD.

## Current Status

This repository now contains a **Phase 1 app skeleton and an interactive Board Mount Designer spike** built on the accepted Cadence-adjacent React + Vite + TypeScript local-first stack ([ADR 0003](docs/decisions/0003-local-first-product-posture.md)) and the owner-approved UI direction ([ADR 0011](docs/decisions/0011-board-mount-designer-ui-direction.md)). The full workflow is walkable: start a local project, add a reference, calibrate it, draw the outline, holes, and keep-outs, choose a mount strategy, inspect a synchronized 2D/3D preview, and export.

What is real: the canonical semantic model (with an explicit unknown/inferred/measured/confirmed value state — unknown is never zero), the pixel-to-millimetre calibration transform with plausibility rejection, the validation engine, a versioned schema with a migration harness, and a metadata sidecar on export. It is covered by host-level unit tests and a headless Playwright journey.

What is **not** real yet, and is deliberately deferred with a plan under [`docs/plans/`](docs/plans/): a solid geometry kernel, a valid STEP body and Fusion import evidence, a hardened project file format, camera capture and skew-aware calibration, and the full test/accessibility/CI system. The 3D bracket is an illustration and the exported STEP/STL are labelled placeholders — nothing here should be read as proof that a board can be detected from an image, generated as a validated solid, imported into CAD, printed, or physically fitted.

## Running The App

```bash
pnpm install          # Node 20+ recommended
pnpm dev              # local dev server (Vite)
pnpm test             # host-level unit tests (vitest)
pnpm run typecheck    # TypeScript project references
pnpm run build        # production bundle
pnpm exec playwright test   # headless browser journey
```

The documentation-audit commands below still apply to the docs and are independent of the app.

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
- [Component spec](docs/design/COMPONENT_SPEC.md) is the implementation-level UI reference the app follows.
- [Deferred-feature plans](docs/plans/) spec the geometry kernel, STEP export, persistence, image/calibration, and testing/CI work that the shell does not yet implement.
- [NEXT](docs/NEXT.md) names the exact active resume anchor.
- [Onboarding](docs/ONBOARDING.md) lists the local app and documentation commands.

The app source lives under `src/`: `src/core` (units, project model, validation, geometry adapter, export), `src/state` (store), `src/components` (design-system primitives), and `src/features` (library, designer, states).

