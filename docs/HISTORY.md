---
title: History
tier: record
status: append-only
updated: 2026-08-17
audited: 2026-08-17
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

