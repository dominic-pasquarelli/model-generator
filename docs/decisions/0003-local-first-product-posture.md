---
title: ADR 0003 Local-First Product Posture
tier: decision
adr: 0003
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/UX_VISION.md
  - docs/NEXT.md
---

# ADR 0003 - Local-First Product Posture

## Status

Proposed. Owner decision needed.

## Question

Should the first implementation be browser-first/PWA, desktop wrapper, or another delivery posture?

## Options

| Option | Benefits | Risks |
|---|---|---|
| Browser-first/PWA | Low friction, visual workflow, local files possible, aligns with reference-product usability. | Geometry kernels and file access may be constrained. |
| Desktop wrapper | Stronger local file system and compute integration. | More packaging overhead before the first workflow proves value. |
| Library/CLI first | Fast host-level geometry experimentation. | Delays the direct-manipulation UX that defines the product. |

## Recommendation

Start with a browser-first local workflow only if the geometry/export feasibility spike shows the required kernel and file behavior are practical. Otherwise, narrow the first spike around the geometry layer before committing to UI delivery.

## Work Blocked

Product app scaffolding and runtime-specific commands.

