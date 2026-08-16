---
title: ADR 0006 Initial Export Format Contract
tier: decision
adr: 0006
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0006 - Initial Export Format Contract

## Status

Proposed. Experiment required.

## Question

Which export formats are supported in the first Board Mount Designer slice, and what claims may the project make about each?

## Proposed Rule

Do not promise an export format until the chosen geometry path can produce it with named evidence. Distinguish printable mesh output from editable CAD output.

## Minimum Metadata

Every export should record project schema version, units, generator version, input parameters, warnings, and known limitations.

## Spike Needed

Test candidate STL/STEP/3MF or other formats against a simple board mount and at least one downstream tool. Record what is editable, printable, lossy, or unsupported.

