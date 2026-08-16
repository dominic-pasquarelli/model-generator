---
title: ADR 0011 Board Mount Designer UI Direction
tier: decision
adr: 0011
status: accepted
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/design/UI_MOCKUPS.md
  - docs/design/COMPONENT_SPEC.md
  - docs/UX_VISION.md
  - docs/decisions/0003-local-first-product-posture.md
---

# ADR 0011 - Board Mount Designer UI Direction

## Status

Accepted. Authority: explicit owner instruction on 2026-08-16 that the committed mockups and component spec serve as the guiding, owner-approved UI for implementation.

## Question

What visual and structural UI target should Board Mount Designer implementation follow, and with what authority?

## Decision

The [UI mockups](../design/UI_MOCKUPS.md) (nine light screens plus three dark-chrome variants in `docs/design/mockups/`) and the [component spec](../design/COMPONENT_SPEC.md) are the **owner-approved guiding UI reference** for Board Mount Designer implementation:

- The Phase 1 skeleton, the UX spike, and later implementation slices should build toward these screens — layout regions, workflow rail order, component inventory, state-vocabulary chips, validation presentation, canvas mark language, and the light/dark token system — using the spec's fidelity checklist as the acceptance bar.
- The mockup sources (`docs/design/mockups/src/`, with `mockup.css` as the token source of truth) are the reference implementation of the approved direction; when the spec and a rendered PNG disagree, the sources govern.
- Deviations discovered during implementation (technical constraints, usability findings from the spike, accessibility fixes) are expected and allowed, but should be deliberate: note material departures in the affected doc or in HISTORY so the approved reference and the built product do not drift silently.

## Context

The repository is in foundation status with no product code. The mockups and spec were produced against UX Vision's workspace direction, first-user journey, state vocabulary, required early states, and mock-honesty rules, and the owner reviewed the rendered set and instructed that it be treated as approved guiding UI rather than an unratified candidate.

## Consequences

- Implementation has a single in-repo visual target with exact tokens and metrics; "does it match the mockups?" is now an answerable review question backed by owner authority.
- UI_MOCKUPS.md and COMPONENT_SPEC.md carry owner-approved guiding status instead of plain Direction; both remain living documents refined through normal review under this ADR's authority.
- UX Vision's mock-honesty rules still bind: approval covers the UI direction, not any claim that features are Built or Verified.

## What This Does Not Decide

- Geometry kernel (ADR 0005), export formats (ADR 0006), project schema (ADR 0004/0007), image/privacy boundary (ADR 0008), and license (ADR 0009) remain open and are not constrained by UI approval.
- The visual identity is approved as the guiding direction, not frozen pixel-for-pixel forever; refinement continues through review, and this ADR can be superseded if the owner later ratifies a different direction.
- Responsive breakpoints, camera-capture UI, real 3D preview rendering, and shared component extraction (ADR 0003 boundary) remain future work.
