---
title: ADR 0008 Image Processing And Privacy Boundary
tier: decision
adr: 0008
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/UX_VISION.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0008 - Image Processing And Privacy Boundary

## Status

Proposed. Owner decision needed.

## Question

How should board images and drawings be handled, and may optional analysis services inspect them?

## Proposed Rule

Start from a local-reference mental model. Image analysis may suggest features, but suggestions remain inferred until the user confirms or measures them. No service upload should be required for the basic local workflow unless explicitly ratified.

## Open Decisions

- local-only processing versus optional service assistance;
- whether board images are embedded, referenced, or both;
- privacy language for any future upload;
- provenance required for inferred features.

