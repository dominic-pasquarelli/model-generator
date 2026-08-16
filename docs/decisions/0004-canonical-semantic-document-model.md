---
title: ADR 0004 Canonical Semantic Document Model
tier: decision
adr: 0004
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/TOOL_SPEC.md
---

# ADR 0004 - Canonical Semantic Document Model

## Status

Proposed. Owner decision and schema spike needed.

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

