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

## Phase 0 Migration Scope

The first migration harness should be intentionally small:

- `v1` fixture: the minimum Board Mount Designer semantic project from ADR 0004;
- `v0` or legacy fixture: missing one optional field and one unknown value to prove absence is not coerced to zero;
- load/save round trip that preserves stable ids, units, provenance, validation state, and unknown values;
- migration function that is deterministic, tested, and records changed validation semantics when they appear.

## First File-Format Posture

Use JSON for the spike fixture because it is readable and easy to diff. This does not yet ratify the final product file extension, packaging format, image-asset storage strategy, or whether large assets are embedded versus referenced.

## Acceptance Criteria Before Real User Files

- Schema version is explicit.
- Unit and coordinate conventions are explicit.
- Unknown/missing values survive load/save.
- Fixture migration tests run in the host-level test suite.
- Export metadata can reference the source schema version and parameter hash.

