---
title: ADR 0007 Project File Schema And Migration Policy
tier: decision
adr: 0007
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/PROJECT_VISION.md
---

# ADR 0007 - Project File Schema And Migration Policy

## Status

Proposed. Schema spike required.

## Question

What is the project file format, and how will saved files evolve without losing unknown optional data?

## Proposed Rule

Use explicit schema versions and additive migrations before real user files exist. Missing optional data means absent or unknown, not zero.

## Migration Requirements

- deterministic migration tests;
- preservation of unknown extension fields where practical;
- explicit unit and coordinate declarations;
- migration notes for changed validation semantics;
- export metadata tied to source schema version.

## Work Blocked

Persistent user files and import/export UX.

