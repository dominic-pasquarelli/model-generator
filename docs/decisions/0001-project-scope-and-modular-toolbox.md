---
title: ADR 0001 Project Scope And Modular Toolbox
tier: decision
adr: 0001
status: accepted
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/workflows/BOARD_MOUNT_ASSEMBLY.md
---

# ADR 0001 - Project Scope And Modular Toolbox

## Status

Accepted.

## Context

The seed README defines Model Generator as a tool to reduce common modeling inconveniences. It names Board Mount Designer as the first concrete workflow and Board Mount Assembly as a later add-on.

## Decision

Model Generator is a modular toolbox for recurring modeling workflows.

- Board Mount Designer is the first vertical.
- Board Mount Assembly is later and depends on reusable semantic board definitions.
- The project does not claim to replace general-purpose CAD.
- New tools should be added only when they remove a recurring modeling inconvenience.

## Consequences

- The first implementation should prioritize one complete useful workflow over broad platform breadth.
- Shared units, transforms, validation, persistence, geometry generation, and export metadata should not be privately duplicated per tool.
- Future assembly work must compose semantic interfaces and constraints, not imported meshes alone.
- README and docs must keep the foundation/pre-implementation state honest until code and evidence exist.

