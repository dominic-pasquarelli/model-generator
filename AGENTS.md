# AGENTS.md - Model Generator

This repository contains a **working Board Mount Designer** in `src/` (React + Vite + TypeScript, ADR 0003; owner-approved UI, ADR 0011), verified by host-level unit tests and a headless Playwright journey. What is Built and Verified (host/browser-level): the app shell and workflow, the canonical semantic model with an unknown/inferred/measured/confirmed value state, the pixel→mm calibration transform, validation, a versioned schema with a migration harness, a **self-contained solid generator** (`src/core/geometry/mesh.ts`) that builds a watertight, closed-manifold bracket (plate + bored standoffs + side tabs), **real ASCII STL and faceted-B-rep STEP export**, a **live orbitable 3D preview of the actual generated solid**, portable **`.mgproj` project files** (save/open), a working **mm/inch** display toggle, and **undo/redo**. What is still **not** proven — and must not be implied as more than it is: the STEP is a *faceted* B-rep (curved walls are facets, not analytic surfaces), and **Autodesk Fusion import evidence and printed-part fit are unrecorded** (ADR 0006); automatic board detection from an image, camera capture / skew-aware calibration, and the full accessibility/CI system remain deferred with plans under `docs/plans/`. Never claim CAD-import, print, or physical-fit success without the named evidence.

## Read Order

1. [docs/NEXT.md](docs/NEXT.md) - exact active resume anchor.
2. [docs/PROJECT_VISION.md](docs/PROJECT_VISION.md) - product scope, authority labels, goals, and non-goals.
3. [docs/workflows/BOARD_MOUNT_DESIGNER.md](docs/workflows/BOARD_MOUNT_DESIGNER.md) - first value slice.
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - sources of truth and unresolved technical decisions.
5. [docs/TOOL_SPEC.md](docs/TOOL_SPEC.md) - contract for future modeling tools.
6. [docs/DOC_SPEC.md](docs/DOC_SPEC.md) and [docs/AUDIT.md](docs/AUDIT.md) - documentation and audit rules.

## Standing Boundaries

- Model Generator is a modular toolbox for recurring modeling workflows, not a general CAD replacement.
- Board Mount Designer is first. Board Mount Assembly is later and recall-gated.
- Images and generated previews are references or derived artifacts, not physical truth.
- Pixel coordinates are not millimeters until calibration establishes a transform.
- Unknown or absent data must not be silently encoded as zero.
- Preview and export must derive from the same canonical model or a documented shared geometry path.
- The chosen UI framework, geometry kernel, export formats, file schema, local/cloud posture, image-processing boundary, and license require ADRs before implementation depends on them.
- Gridfinity Layout Tool is a product/workflow reference only. Do not copy its source, screenshots, assets, prose, distinctive styling, or AGPL implementation without an explicit owner-approved licensing ADR.

## Evidence Vocabulary

Use the authority and evidence labels from [docs/PROJECT_VISION.md](docs/PROJECT_VISION.md): Owner-confirmed, Ratified, Direction, Proposed, Experiment, Future possibility, Built, and Verified.

Never call something Built unless it is present in code. Never call something Verified without naming the evidence class: host-level, browser-level, generated-geometry-level, printed-part-level, or physical assembly-level.

## Snapshot And Idea Capture

If the user gives a raw idea, friction note, or future possibility, capture it in [docs/INBOX.md](docs/INBOX.md) unless it is clearly the current task. Captured items need a status and either a destination or recall trigger. Do not let INBOX become authority.

## Local Commands

App commands (Node 20+, pnpm):

```bash
pnpm install
pnpm dev                    # local dev server (Vite)
pnpm test                   # host-level unit tests (vitest)
pnpm run typecheck          # TypeScript project references
pnpm run build              # production bundle
pnpm exec playwright test   # headless browser journey (uses the pre-installed Chromium)
```

Documentation foundation commands:

```bash
python3 tools/doc-audit/doc_audit.py --write-map
python3 tools/doc-audit/doc_audit.py --check
python3 -m unittest discover tools/doc-audit/tests
```

For platform-specific command notes, including the Windows Python launcher fallback, see [docs/ONBOARDING.md](docs/ONBOARDING.md).

## Closeout Rule

Before ending a foundation or documentation pass:

1. Update `docs/NEXT.md` with the exact next action.
2. Move completed active work into `docs/HISTORY.md`.
3. Update affected ADRs or leave proposed decisions explicitly open.
4. Regenerate `docs/MAP.md`.
5. Run the audit command and doc-audit tests.
6. Add or update an entry in `docs/audit-log.md`.

