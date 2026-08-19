---
title: History
tier: record
status: append-only
updated: 2026-08-19
audited: 2026-08-19
related:
  - docs/NEXT.md
  - docs/audit-log.md
---

# HISTORY

## 2026-08-16 - Repository seed

The initial README established Model Generator as a toolbox for common modeling inconveniences, with Board Mount Designer as the first idea and Board Mount Assembly as later scope.

Owner-confirmed seed ideas preserved:

- board image upload or drawing reference;
- mounting holes and keep-out zones;
- prompted measurements for hole sizes and spacing;
- generated bracket or mount geometry;
- 3D visualization;
- export into modeling software;
- later mounting tabs, stands, and other mount helpers;
- later composition of multiple board mounts into an electronics pod with header clearance, wire paths, power, ports, stacking, and modular routing.

## 2026-08-16 - Foundation pass

Established product vision, workflow docs, conceptual architecture, tool contract, documentation specification, audit protocol, ADR foundation, generated map, and lightweight documentation audit tooling. Product implementation remains deliberately unbuilt.

## 2026-08-16 - UI mockup direction pass

Added nine static Board Mount Designer UI mockups under `docs/design/` — rendered PNGs plus the hand-authored HTML/SVG sources and render script — covering the minimum user journey and every required early state from UX Vision. The mockups are Direction only: they encode the workflow rail, 2D/3D workspace shape, state vocabulary chips, validation honesty, and export gating without claiming any feature is Built or Verified. The interactive UX spike with usability notes remains open in NEXT.

## 2026-08-16 - Component spec and dark mode pass

Added `docs/design/COMPONENT_SPEC.md`: the implementable companion to the mockups with the full modular component inventory, design tokens for light and dark themes, layout metrics, canvas overlay mark specifications, interaction contracts, accessibility requirements, state-vocabulary binding, a React/Radix/Tailwind implementation mapping, and a fidelity checklist. The mockup design system itself gained a token-driven dark theme (`?theme=dark` on any mockup page) with three committed dark reference renders; the canvas remains theme-invariant. Everything stays Direction — no visual style is ratified and no product code exists.

## 2026-08-16 - Owner approval of the UI direction

The owner reviewed the committed mockup set and component spec and instructed that they serve as the guiding, owner-approved UI for implementation. Recorded as Accepted [ADR 0011](decisions/0011-board-mount-designer-ui-direction.md); UI_MOCKUPS, COMPONENT_SPEC, and NEXT now carry the approved status. Approval covers the UI direction only — kernel, export formats, schema, privacy boundary, and license ADRs remain open, and nothing is claimed Built or Verified.

## 2026-08-16 - Local setup and Phase 0 hardening

Merged the owner-approved UI direction PR, hardened the documentation audit so generated-map checks do not fail from date-only drift, documented Windows `python` command variants, made mockup rendering accept `PYTHON_BIN`, and added a regression test for the map-date behavior. ADRs 0004-0008 now contain concrete Phase 0 spike scopes for the semantic fixture, schema migration harness, geometry candidate matrix, STEP/Fusion export gate, and local image/reference posture. Product code remains unbuilt.

## 2026-08-16 - Tooling hardening review follow-up

Closed the review findings on the setup hardening pass: strengthened the map-date regression test, made `write_map` preserve the existing map date when only the date would change, consolidated Windows Python fallback guidance into Onboarding, and made mockup rendering fail if Chromium returns an undersized screenshot. Product code remains unbuilt.

## 2026-08-17 - Phase 1 app skeleton and interactive Board Mount Designer spike

First product code lands in `src/`. Built a Cadence-adjacent React + Vite + TypeScript local-first app (ADR 0003) implementing the owner-approved UI (ADR 0011) and the full Board Mount Designer workflow shell.

Built (present in code):

- Design system ported from `mockups/src/mockup.css` as token CSS (light + dark chrome, theme-invariant canvas) plus a lucide-style inline icon set — no external fonts or CDNs.
- The complete component inventory from `COMPONENT_SPEC.md`: chrome (top bar, breadcrumb, workflow rail, inspector, status bar, validation panel), primitives (buttons, chips/state chips, fields, segmented control, select, checkbox, radio cards, progress, spinner, dialog/popover/scrim), library cards, canvas toolbar/zoom, and the overlay marks (outline, hole markers by state, keep-out zones, calibration line, conflict rings, label pills).
- A canonical semantic model with the `Val<T>` unknown/inferred/measured/confirmed wrapper (unknown is never zero), centralized mm/px units and a calibration transform with plausibility rejection, a versioned JSON schema with a forward-migration harness and a v0→v1 fixture, a validation engine driving step flags + the validation panel + export readiness, a replaceable `GeometryAdapter` boundary, and a deterministic ILLUSTRATIVE mock generator (no kernel; `exactSolid: false`).
- Interactive flow: library → project → reference (upload or sample) → single-line calibration (with rejection) → outline/holes/keep-outs by direct manipulation with exact typed editing → mount strategy → synchronized 2D/3D preview → export dialog with ready/blocked/progress/failed/complete states and a real metadata sidecar. localStorage persistence.

Verified (browser-level and host-level): 26 host-level unit tests (units, calibration, schema/migration, validation, generation determinism) and a 6-case Playwright journey pass headless; `tsc` typechecks and `vite build` bundles.

Not built / still deferred (each has a proposed plan under `docs/plans/`): a real solid geometry kernel, a valid STEP body and the Fusion import evidence gate, a hardened project file schema and persistence, robust image/camera capture and skew-aware calibration, and the full test/a11y/CI system. No physical fit is claimed. The 3D bracket is an illustration; the STEP/STL artifacts are labelled placeholders plus a real sidecar, not validated CAD.

Also added five proposed implementation-plan documents under `docs/plans/` for the deferred features, and taught the doc-audit tool to skip `node_modules` and build/test output now that product code exists.

An adversarial review pass (multi-agent, each finding independently verified) then hardened the code before review: the generator now refuses to fabricate a mount height from an unknown standoff/base (unknown is never zero); the export readiness checklist reports clipped standoff seats instead of always claiming keep-out avoidance; the standoff-seat radius is skipped rather than assumed when the boss diameter is unknown; the generation parameter hash now includes keep-out geometry and excludes the display-unit toggle; `loadLibrary` parses each project independently (one corrupt entry no longer discards the library) and respects a deliberately empty library; the export progress timer is cancelled on navigation and finalizes only for the project it started on; a rejected calibration no longer bumps the version on a no-op; the number field reverts correctly on Escape; inspector "+ Add" now creates a feature (keyboard-operable), Delete removes the selection, and STEP/STL and the failure-state showcase wording no longer imply a validated CAD solid. Five unit tests were added to lock these in (31 total).

## 2026-08-17 - Third-party review response (shell correctness + honesty)

Implemented the six merge-blockers from an external reviewer of PR #5 — all shell-level correctness and honesty fixes, none expanding into the deferred kernel/persistence/CI work:

1. Custom-reference path: uploads now route through the store's canonical mutation (persist + report failure), unsupported/decoding/read errors are surfaced, PDF (which `new Image()` cannot rasterise) was removed from accepted types, and calibration no longer defaults to the sample's hard-coded anchors — a two-click endpoint placement was added, with anchors validated finite and inside the image bounds before any millimetres are derived.
2. Persistence + reusable-library honesty: `persistLibrary` returns a result and drives an explicit `saved | error | idle` save state; "Autosaved" shows only after a confirmed write (else "Unsaved — …"); corrupt whole-library and per-project data are quarantined under a recovery key instead of being silently reseeded/overwritten; `parseProjectFile` now runtime-decodes nested shapes (so `board: null` fails at parse); the fictional filesystem copy was replaced with "browser-local drafts"; "Open project…" is disabled as planned; and "Save board to library" is durable, reloadable, and shown on the library page.
3. Generation freshness is proven, not trusted: a single canonical `generationKey` in board-space millimetres (full outline + hole + keep-out geometry, adapter version) replaces the image-pixel/bbox hash; `isGenerationCurrent`/`isCurrentModelExported` are recomputed everywhere (readiness, preview, step status, export history); `generate()` supersedes older in-flight runs and discards a result whose model changed during the async run; `upToDate` was removed so a persisted flag can never mark a stale model current.
4. Domain validity: known-but-invalid values (non-positive diameters, heights, thickness, negative clearances, degenerate outlines, missing holes, shape/payload mismatches) are now blocking errors in the core; `exportReadiness.blockers` is never empty while `ready` is false; the keep-out shape selector materialises consistent geometry on change; and the inch unit option is disabled until conversion is wired.
5. `NumberField`: Enter and blur each commit exactly once, the canonical value is rounded to the field precision (stored equals displayed), min/max are enforced, and a semantically-unchanged value does not bump the version — via an extracted pure `resolveCommit`.
6. Export lifecycle honesty: honest placeholder stages (no fake kernel booleans, no fixed hole counts), `durationMs` is explicitly unavailable for the illustrative adapter, an `ExportRecord` is written only when the download is actually initiated (dialog reads "Artifact prepared", not "Exported"), current-export status is keyed to the generation, and "Copy report" is wired.

Verification: 60 host-level unit tests (jsdom store tests for quota/malformed-recovery/survivors/generation-race/export-prepared-vs-downloaded, pure `generationKey`/`resolveCommit`/domain-validity tests) and 9 Playwright cases (added PNG-upload-reload, endpoint-placement calibration, keep-out shape change, and export-prepared-not-recorded) pass; `tsc` and `vite build` are clean; doc-audit passes.

## 2026-08-19 - Real solid, real exports, live 3D, and usability sprint

Turned the illustrative shell into a working tool. Preview and export now derive from one real, deterministic, dependency-free solid built from the canonical model — no kernel dependency, no placeholders.

- **Real geometry** (`src/core/geometry/mesh.ts`, `solidGenerator.ts`): `buildBracketMesh` emits a watertight, closed-manifold multi-body solid in board-space millimetres — a base plate, one hollow standoff (outer boss + coaxial blind bore) per mounting hole, and optional side tabs. Faceting is a single fixed segment count shared by every consumer. Verified host-level: every body passes a directed-edge / undirected-edge / Euler manifold audit, and the ADR-0005 fixture yields the expected 91 mm footprint, base+standoff height, and standoff count. It is now the active `GeometryAdapter` (`exactSolid: false`, `previewMesh: true`, `facetedStep: true`); the illustrative mock is retained for store-test isolation. ADR 0005 → Accepted.
- **Real STL** (`src/core/export/stl.ts`): a genuine ASCII STL — a printable mesh of the solid with per-facet normals; verified one facet per triangle, deterministic bytes.
- **Real STEP** (`src/core/export/step.ts`): a real faceted B-rep, ISO-10303-21 AP214 — one `MANIFOLD_SOLID_BREP` closed shell per body, welded vertices, shared `EDGE_CURVE`s referenced with opposite `ORIENTED_EDGE` sense. Verified host-level: well-formed envelope, all `#id` references resolve, one closed shell per body, one `ADVANCED_FACE` per triangle, every edge shared by exactly two faces with opposite sense. The exporter writes honest metadata (`kernel`, geometry kind, body/triangle counts, `unsupportedClaims`). ADR 0006 → Accepted (Fusion import evidence gate still open).
- **Live 3D preview** (`canvas/mesh3d.ts`, `MeshView3D.tsx`): a dependency-free orthographic projector with backface culling, painter's ordering, and flat shading. The 3D preview and the export view now render the ACTUAL generated solid (drag to orbit); the static illustration image is gone. "Derived from canonical model" is now literally true.
- **Durable project files**: `.mgproj` save (`downloadProjectFile`) and open (library "Open project…", `importProjectFile`) on the existing versioned schema + migrations; import is additive (fresh id on collision), corrupt files fail with a diagnosable `MgFileError`. ADR 0007 → Accepted.
- **Unit-aware display**: the mm/inch toggle (previously stored but ignored) is now a live display conversion across inspector fields (via `MmField`) and readouts (`fmtLen`) — canonical model stays in mm.
- **Undo/redo**: per-project snapshot history in the store, wiring the previously-disabled top-bar buttons plus Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z.

Honesty boundary held: the STEP is faceted (not analytic surfaces); Fusion import evidence and printed-part fit remain unrecorded; automatic board detection and camera/skew-aware calibration remain unbuilt. The export UI, sidecar, README, AGENTS, and ADRs 0005/0006/0007 all state this precisely.

Verified: 79 host-level unit tests (added mesh manifold audit, STL/STEP structural validity, 3D projection, undo/redo, project-file round-trip, unit formatting) and 9 Playwright cases pass headless; `tsc` and `vite build` are clean; doc-audit passes.

