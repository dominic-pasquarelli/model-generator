---
title: History
tier: record
status: append-only
updated: 2026-08-16
audited: 2026-08-16
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

