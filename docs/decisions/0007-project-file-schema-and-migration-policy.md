---
title: ADR 0007 Project File Schema And Migration Policy
tier: decision
adr: 0007
status: accepted
date: 2026-08-16
updated: 2026-08-19
audited: 2026-08-19
related:
  - docs/ARCHITECTURE.md
  - docs/PROJECT_VISION.md
---

# ADR 0007 - Project File Schema And Migration Policy

## Status

Accepted (2026-08-19). Portable **`.mgproj` files** (save + open) are Built and Verified host/browser-level, on the existing versioned schema and forward-migration harness. Asset-packaging for large reference images remains a documented refinement (see Decision).

## Decision (2026-08-19)

The project file is JSON — the `{ schemaVersion, project }` wrapper written by `serializeProject` and read by `parseProjectFile` (`src/core/project/schema.ts`), carried by the app as the `.mgproj` extension. Save/open UX is wired: `downloadProjectFile` (designer top bar) serialises the open project; `importProjectFile` (library "Open project…") parses one back in. Import is **additive** — a colliding project id is reassigned a fresh id so nothing is clobbered — and corrupt input fails with a diagnosable `MgFileError` surfaced in the UI, never silent defaults.

The Acceptance Criteria below are met: schema version and unit/coordinate conventions are explicit; unknown/missing values survive load/save (the `Val<T>` union round-trips); fixture migration tests (including a `v0→v1` case) run in the host suite; a round-trip store test locks additive import; and export metadata references the source schema version and `paramsHash`.

Open refinement (not blocking): reference images are embedded as data-URL `src` inside the JSON, which is simple and self-contained but bloats files with large photos. A future revision may switch large assets to a zipped container (`.mgproj` as an archive) with referenced assets — a packaging change that does not alter the semantic schema or the migration policy.

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

