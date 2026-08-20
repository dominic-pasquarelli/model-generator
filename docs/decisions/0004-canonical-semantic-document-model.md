---
title: ADR 0004 Canonical Semantic Document Model
tier: decision
adr: 0004
status: accepted
date: 2026-08-16
updated: 2026-08-20
audited: 2026-08-20
related:
  - docs/ARCHITECTURE.md
  - docs/TOOL_SPEC.md
---

# ADR 0004 - Canonical Semantic Document Model

## Status

Accepted (2026-08-20). The canonical semantic project document is Built and is the
load-bearing source of truth for the whole app: kernel/mesh/scene/export artifacts are all
derived from it. The `Val<T>` honesty union (`unknown` vs `inferred` / `measured` /
`confirmed`) is implemented in `src/core/project/value.ts` and threaded through every
numeric field, so unknown never serialises as zero. ADR 0007 (Accepted) ratifies the
persisted `.mgproj` form of this model and its migration policy; ADR 0007 can no longer
depend on a merely-Proposed 0004.

## Decision (2026-08-20)

The spike is complete and every Spike Exit Criterion below is met by shipped code:

- The document types live in `src/core/project/types.ts`; construction/fixtures in
  `src/core/project/fixtures.ts`; derived geometry-affecting values and the canonical
  generation key in `src/core/project/derive.ts`.
- Unknown / absent / inferred / measured / confirmed are distinct at the type level
  (`Val<T>` = `Unknown | Known<T>` with a `source` discriminant) and are validated as an
  untrusted boundary on load (`validateProjectShape` / `parseProjectFile` in
  `src/core/project/schema.ts`, ADR 0007 / reviewer #7).
- No missing numeric value serialises as `0`: the schema validator rejects a `known` value
  whose `value` is not finite, and round-trip tests prove absence survives load/save.
- The same fixtures feed host-level validation, geometry, export, and store tests, and the
  UI editor — one document model, many derived consumers.
- Kernel-native objects, scene nodes, and exported files are derived at read time
  (`buildBracketMesh`, the STL/STEP writers, the 3D preview) and are never durable truth.

The sections below are retained as the original Phase-0 spike record.

## Question

Should project truth live in a versioned semantic document rather than a geometry-kernel-native object graph?

## Proposed Decision

Use a canonical semantic project document as the durable source of truth. Kernel objects, scene objects, meshes, and exports are derived artifacts.

## Rationale

Board Mount Assembly depends on reusable meaning: outlines, holes, keep-outs, connector envelopes, clearances, source measurements, and uncertainty. That meaning is expensive to recover from opaque geometry.

## Spike Needed

Draft the smallest board-definition schema with unknown-vs-zero examples, calibration anchors, units, provenance, validation state, and migration fixtures.

## Phase 0 Schema Scope

The first schema spike should produce a human-readable JSON fixture, not a product file format promise. The fixture should cover one synthetic board-mount project:

- project metadata: schema version, units, created/updated timestamps, generator version placeholder;
- reference asset: local path or asset id, pixel dimensions, provenance, missing-file behavior;
- calibration: two image points, measured distance in millimeters, transform result, source, uncertainty state;
- board: id, name, revision, outline polygon in board coordinates, thickness;
- mounting holes: stable ids, centers, diameter, fastener type, source/provenance, state;
- keep-outs: shape, board side, dimensions, clearance height or depth, purpose, source/provenance;
- mount strategy: strategy id, standoff height, base thickness, boss diameter, tolerance, optional side-tab count;
- validation results: severity, code, affected entity id, message, suggested fix target;
- generated-model metadata: source project version, parameter hash, warnings, export metadata placeholder.

## Spike Exit Criteria

- Unknown, absent, inferred, measured, and confirmed values are represented distinctly.
- No missing numeric value serializes as `0` unless the user explicitly entered zero.
- The same fixture can feed host-level validation tests and later UI/editor fixtures.
- Kernel-native objects, scene graph nodes, and exported files remain derived artifacts, not durable project truth.

