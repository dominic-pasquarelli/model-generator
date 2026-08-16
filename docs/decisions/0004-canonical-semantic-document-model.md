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

