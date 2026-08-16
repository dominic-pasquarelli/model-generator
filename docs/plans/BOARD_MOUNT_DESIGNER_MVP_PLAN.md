---
title: Board Mount Designer MVP Plan
tier: workflow
tool: board-mount-designer
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/decisions/0010-board-mount-designer-mvp-target.md
---

# Board Mount Designer MVP Plan

## MVP Target

Build the smallest honest workflow that lets a user:

1. add or capture a board photo/reference image;
2. calibrate it with trustworthy measurements;
3. draw the board outline, mounting holes, and keep-out/clearance zones;
4. choose a basic bracket/mount strategy;
5. generate a 3D bracket from the canonical semantic model;
6. preview the derived model;
7. export a CAD file that imports into Autodesk Fusion;
8. save the reusable board/mount definition for later refinement.

This is the first real shakedown of the product: image/reference handling, calibration, direct editing, semantic zones, validation, geometry generation, preview/export parity, persistence, and downstream CAD evidence.

## MVP Success Definition

The MVP is complete only when one documented test board can move through the full workflow:

- photo or reference image added locally;
- scale calibrated from a known measurement;
- outline, at least two mounting holes, and at least one keep-out zone drawn manually;
- required board thickness, hole diameter, standoff height, clearance, and tolerance values entered;
- validation errors resolved;
- bracket generated from the same canonical model used by preview and export;
- STEP file exported with metadata;
- STEP imported into Fusion with correct units and expected dimensions;
- project saved and reopened without losing semantic meaning;
- evidence recorded in HISTORY or audit-log.

Autodesk documents STEP (`.ste`, `.step`, `.stp`) as a supported Fusion import format. STEP is therefore the MVP success target. STL may be useful for print previews or diagnostics, but STL alone is not enough for this MVP because the goal is CAD import and refinement.

## MVP Non-Goals

- Automatic board detection from the image.
- Automatic component recognition.
- Perspective correction beyond a bounded calibration workflow.
- Full enclosure design.
- Board Mount Assembly.
- A ratified modular bracket slot standard.
- Cloud sync, accounts, collaboration, marketplace, or telemetry.
- Perfect parametric editability inside Fusion.
- Physical fit certification beyond an optional first-fit follow-up.

## Core Assumptions

- The initial image is approximately top-down or orthographic enough for a calibration-line MVP.
- User measurements are the source of physical truth.
- The first bracket strategy is simple: board outline or bounding plate, standoffs at mounting holes, screw/insert holes, basic clearances, optional simple side tabs.
- Missing data remains unknown, not zero.
- The geometry/export path must be replaceable behind an adapter if the first kernel choice fails.

## Recommended Technical Posture

ADR 0003 accepts a **Cadence-adjacent local-first browser MVP with an Electron-compatible path**.

Why:

- Image upload/camera capture, 2D drawing, and 3D preview fit browser workflows well.
- A browser app keeps the first user path low-friction and account-free.
- React/Vite/TypeScript/Tailwind conventions keep Model Generator close to Cadence and Axon web surfaces.
- Electron remains available if the app needs desktop file access, packaging, or a supervised local geometry helper.
- The geometry/export layer can still move to a worker, local helper, or desktop wrapper if STEP generation proves impractical in-browser.

Do not let stack similarity create repo coupling. Shared components should be extracted deliberately after a stable second consumer exists.

## Cadence-Adjacent Stack Baseline

Phase 1 should start close to Cadence unless the Phase 0 spike discovers a hard blocker:

| Area | MVP Baseline |
|---|---|
| Language | TypeScript |
| App shell | React + Vite |
| Styling/components | Tailwind-compatible styling, lucide-style icon vocabulary, Radix/shadcn-compatible component patterns where useful |
| Local scripts | Node workspace scripts similar to Cadence: `dev`, `build`, `typecheck`, `test` |
| Browser tests | Playwright or the closest Cadence-compatible UI smoke path |
| Desktop path | Electron-compatible structure, but no packaging until the browser MVP proves value |
| Shared code posture | Share conventions now; extract packages only after a real second consumer exists |

## Geometry/Export Candidate Strategy

Phase 0 should compare candidate geometry paths against the STEP/Fusion gate:

| Candidate | Why It Is Plausible | Gate |
|---|---|---|
| Browser/WASM solid kernel with STEP support | Keeps the whole MVP local and browser-first. | Must generate a valid STEP for the fixture bracket and import into Fusion. |
| Worker-backed geometry adapter | Keeps expensive generation off the UI thread. | Must preserve deterministic errors and progress/cancel behavior. |
| Electron/local helper around a solid kernel | Preserves the accepted stack while adding local filesystem/compute strength if browser export fails. | Must remain optional until packaging is justified. |
| Mesh-only STL path | Useful for preview or print diagnostics. | Cannot satisfy MVP by itself because Fusion refinement is the target. |

Open CASCADE Technology is a serious candidate family because its official data-exchange materials cover engineering-format exchange including STEP. That is not a kernel decision yet; ADR 0005 owns the measured choice.

## External Technical References

- Autodesk Fusion supported import formats: <https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/File-formats-supported-by-Fusion-360.html>
- Open CASCADE data exchange overview: <https://dev.opencascade.org/about/data_exchange>

## Proposed Repository Shape

```text
src/
  app/                         # shell, routing, persistence wiring
  core/
    units/                     # mm, px, transforms, coordinate conventions
    project/                   # schema, migrations, identifiers, provenance
    validation/                # shared validation result model
  geometry/
    adapter/                   # selected kernel boundary
    boardMount/                # deterministic generation from semantic model
  export/
    fusionStep/                # STEP export contract and metadata
  preview/                     # derived 3D scene only
  tools/
    board-mount-designer/
      model/
      editor2d/
      inspector/
      fixtures/
tests/
  fixtures/
    boards/
evidence/
  fusion-import/
```

The exact package layout, command names, and test runner details should follow the Cadence-adjacent posture in ADR 0003. This layout is a planning target, not a ratified file structure.

## Canonical MVP Model

Minimum semantic entities:

| Entity | Required MVP Fields |
|---|---|
| Project | schema version, units, created/updated timestamps, generator version |
| Reference image | local asset id, dimensions in pixels, provenance, optional capture metadata |
| Calibration | two or more image points, measured distance in mm, transform, uncertainty status |
| Board | id, name, revision, outline polygon in board coordinates, thickness |
| Mounting hole | center, diameter, type, source/provenance, confirmation state |
| Keep-out zone | shape, board side, clearance height/depth, purpose, source/provenance |
| Mount strategy | strategy id, standoff height, wall/base thickness, screw/insert choice, tolerance |
| Generated model | source project version, parameters hash, warnings, export metadata |

Later extensions may add connector envelopes, cable/service zones, heat/airflow, modular slot standards, board-to-enclosure interfaces, and physical-fit corrections.

## Phases

### Phase 0 - Decision Packet And Spike Setup

Goal: make the minimum decisions required to start code without silently locking the wrong geometry/export path.

Tasks:

- Accept ADR 0010 as the MVP target.
- Treat ADR 0003 as the accepted Cadence-adjacent delivery posture.
- Define the STEP/Fusion evidence gate in ADR 0006.
- Choose candidate geometry paths for a spike in ADR 0005.
- Decide whether the MVP includes browser camera capture or starts with image upload and later adds camera capture.
- Define the component-sharing boundary: copy conventions freely, extract packages only when Axon/Cadence/Model Generator have a real shared consumer.

Exit evidence:

- NEXT points to Phase 1.
- Geometry/export spike scope is written.
- Phase 1 app skeleton target is React/Vite/TypeScript with Cadence-adjacent scripts and UI conventions.

### Phase 1 - App Skeleton And Local Project Shell

Goal: create the first runnable local app without product overreach.

Tasks:

- Set up the Cadence-adjacent runtime, package manager, lint/test commands, and local dev command.
- Add an app shell with Board Mount Designer as the only tool.
- Add project create/open/save placeholders.
- Add empty, loading, invalid, and error states.
- Keep README honest about MVP-in-progress status.

Exit evidence:

- App starts locally.
- Unit test and UI smoke test pass.
- Docs/audit command still passes.

### Phase 2 - Semantic Schema, Units, And Validation Core

Goal: build the source of truth before UI and geometry depend on it.

Tasks:

- Implement the MVP model entities.
- Centralize mm/px units and coordinate transforms.
- Add unknown/inferred/measured/confirmed state handling.
- Add validation result classes: error, warning, info.
- Add JSON fixtures for a simple rectangular board with two holes and one keep-out.
- Add migration harness with v1 fixture.

Exit evidence:

- Host-level tests cover units, calibration transform, unknown-vs-zero, validation errors, and schema load/save.

### Phase 3 - Image Import/Capture And Calibration

Goal: turn a picture into a calibrated reference without pretending it is automatically measured.

Tasks:

- Add image upload.
- Optionally add browser camera capture if it does not delay the upload path.
- Render image on a 2D canvas.
- Let the user place a calibration line and enter the real distance.
- Store calibration provenance.
- Show uncalibrated/inferred/measured state clearly.

Exit evidence:

- A fixture image can be loaded.
- A known calibration line maps pixels to millimeters within tolerance.
- Invalid calibration blocks generation/export.

### Phase 4 - 2D Board And Zone Editor

Goal: let the user manually define the geometry facts the generator needs.

Tasks:

- Draw/edit board outline polygon.
- Add/edit mounting holes with typed center/diameter values.
- Add/edit keep-out zones as rectangles/circles/polygons.
- Add inspector controls for board thickness, standoff height, screw size, insert choice, base/wall thickness, clearance, and tolerance.
- Snap visually where useful but preserve exact editable values.
- Add undo/redo transaction boundaries for edits.

Exit evidence:

- Browser-level test creates a board outline, two holes, and one keep-out.
- Validation explains missing required fields and conflicts.

### Phase 5 - Geometry Generation Spike And Adapter

Goal: prove the bracket can be generated deterministically from the semantic model.

Tasks:

- Build the geometry adapter boundary before choosing kernel-specific APIs everywhere.
- Generate a simple plate/bracket with standoffs and holes.
- Respect keep-out zones and minimum wall/base thickness.
- Emit diagnosable failures.
- Add generated-dimension tests.
- Decide whether the kernel path can also produce STEP for Phase 7.

Exit evidence:

- Generated geometry dimensions match fixtures.
- Preview/export consume the same generated geometry or documented shared path.
- ADR 0005 updated with evidence.

### Phase 6 - 3D Preview

Goal: inspect the derived bracket while keeping the semantic model canonical.

Tasks:

- Add 3D preview of board, holes, keep-outs, standoffs, and bracket.
- Add warning overlays for unresolved uncertainty or export blockers.
- Add regenerate/progress/cancel behavior if generation is expensive.
- Keep preview scene objects derived only.

Exit evidence:

- UI smoke test proves the preview renders a non-empty model.
- Preview updates after a semantic edit.

### Phase 7 - STEP Export And Fusion Import Gate

Goal: prove the generated bracket can leave the app and enter Fusion.

Tasks:

- Export STEP as the MVP CAD target.
- Export metadata sidecar or embedded notes where practical.
- Optionally export STL as a secondary mesh artifact.
- Import the STEP into Fusion.
- Verify unit scale, bounding dimensions, standoff positions, hole diameters, and body count.
- Record screenshots/notes in `evidence/fusion-import/`.

Exit evidence:

- Fusion import succeeds for the fixture board.
- Measurements in Fusion match expected dimensions within named tolerance.
- ADR 0006 updated with supported and unsupported claims.

### Phase 8 - Persistence, Recovery, And MVP Hardening

Goal: make the workflow resumable and safe enough to iterate.

Tasks:

- Save/reopen project file with image reference and semantic model.
- Add project export/import.
- Add autosave or recovery boundary if in scope.
- Add failure handling for corrupt project files and missing images.
- Add complete manual MVP runbook.
- Update README, HISTORY, NEXT, and audit-log.

Exit evidence:

- End-to-end test or manual script completes the MVP path.
- A saved project reopens and regenerates the same bracket.
- Doc audit and test suite pass.

### Phase 9 - Physical First-Fit Follow-Up

Goal: convert CAD import success into real-world confidence.

Tasks:

- Choose a real board.
- Print the bracket with named printer/material/profile.
- Check board fit, hole alignment, screw/insert fit, keep-out clearance, rigidity, and serviceability.
- Record corrections as semantic changes or TECH_DEBT.

Exit evidence:

- Printed-part-level evidence recorded.
- Physical-fit claims remain scoped to the named setup.

## Implementation PR Sequence

| PR | Scope | Must Include |
|---:|---|---|
| 1 | MVP decision packet | ADR 0005/0006 spike scope, ADR 0004/0007 schema scope, no broad product code |
| 2 | App skeleton | Local dev/test commands, empty Board Mount Designer shell |
| 3 | Schema and validation core | Fixtures, units, provenance, migration harness |
| 4 | Image import and calibration | Upload/capture path, calibration tests |
| 5 | 2D editor | Outline, holes, keep-outs, inspector, validation UI |
| 6 | Geometry adapter and generator | Host-level dimension tests and generation failures |
| 7 | 3D preview | Non-empty preview smoke, warning states |
| 8 | STEP export and Fusion gate | Export, Fusion import evidence, ADR 0006 update |
| 9 | Persistence and MVP hardening | Save/reopen, runbook, docs/audit closeout |
| 10 | Physical first-fit | Printed-part evidence and corrections |

## Test Matrix

| Layer | Required Coverage |
|---|---|
| Domain | units, transforms, unknown-vs-zero, validation severity |
| Schema | load/save, migration, fixture compatibility |
| Calibration | pixel-to-mm mapping, invalid distance, missing scale |
| Editor | outline/hole/zone creation and exact value editing |
| Geometry | dimensions, holes, standoffs, keep-out avoidance, deterministic output |
| Preview | non-empty render, update after semantic edit |
| Export | STEP produced, metadata produced, unsupported states blocked |
| Fusion gate | imported dimensions and unit scale checked manually or by documented evidence |
| Persistence | reopen project and regenerate same output |

## Main Risks And Counters

| Risk | Counter |
|---|---|
| Browser STEP export is not viable | Keep geometry behind adapter; allow worker/local helper/desktop fallback after spike. |
| Photo distortion creates false dimensions | MVP requires calibration and clear top-down/photo-quality assumptions. |
| Zone editor grows too complex | MVP supports simple shapes first; advanced envelopes later. |
| Geometry booleans become brittle | Start with simple bracket strategy and dimension fixtures. |
| Fusion import succeeds but scale is wrong | Fusion gate includes measured dimensions and unit checks. |
| STL is mistaken for CAD success | STEP is the MVP success target; STL is secondary only. |
| Modular bracket system over-constrains MVP | Store attachment interfaces semantically, but defer ratified slot standard. |
| App polish delays core proof | Prioritize full workflow proof over visual refinement. |

## Open Owner Calls

- Is image upload enough for MVP, or must browser camera capture be included in the first demo?
- Is the first bracket strategy a board-shaped plate, rectangular plate, or minimal standoff bridge?
- Should the first hardware target use M3 screws/inserts, a user-selected screw size, or both?
- Should modular enclosure tabs be in MVP or immediately after Fusion import works?
- What real board should become the first physical-fit fixture?

## First Session Prompt

```text
Start Model Generator MVP Phase 0. Read AGENTS.md, docs/NEXT.md, docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md, ADR 0003, and ADR 0010. Do not start broad product code yet. Use the accepted Cadence-adjacent React/Vite/TypeScript browser-first posture with an Electron-compatible path. Produce the decision packet needed to begin implementation: ADR 0005 geometry-kernel spike scope, ADR 0006 STEP/Fusion export gate, ADR 0004/0007 schema scope, and the smallest Phase 1 app skeleton plan. Keep the MVP target: image/reference -> calibration -> drawn zones -> generated bracket -> STEP import into Fusion.
```
