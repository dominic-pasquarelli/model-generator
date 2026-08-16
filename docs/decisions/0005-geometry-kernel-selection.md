---
title: ADR 0005 Geometry Kernel Selection
tier: decision
adr: 0005
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0005 - Geometry Kernel Selection

## Status

Proposed. Experiment required.

## Question

Which geometry kernel can generate deterministic board-mount geometry, support useful validation, and produce the selected export formats without forcing the project model to become kernel-native?

## Candidate Evaluation Criteria

- deterministic generation from semantic inputs;
- exact-solid support where needed;
- mesh output where appropriate;
- browser and/or desktop viability;
- worker/background execution support;
- diagnostics for failed generation;
- license compatibility;
- import/export fidelity evidence;
- testability in host-level fixtures.

## Spike Needed

Generate a simple two-hole board mount from semantic inputs, verify expected dimensions, and export in candidate formats. Record failures as evidence, not just preferences.

