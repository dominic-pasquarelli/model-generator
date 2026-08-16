---
title: Architecture
tier: platform
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/TOOL_SPEC.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/decisions/0004-canonical-semantic-document-model.md
  - docs/decisions/0005-geometry-kernel-selection.md
---

# Architecture

## Status

This is a conceptual architecture. ADR 0003 selects a Cadence-adjacent local-first browser stack with an Electron-compatible path. No geometry kernel, storage engine, or export format is selected yet.

## Canonical Data Flow

| Stage | Owns | Must Not Own |
|---|---|---|
| Reference asset | Image, drawing, provenance, calibration anchors | Physical dimensions without calibration |
| Project/document model | Semantic user intent, measurements, uncertainty, versions | Kernel-native object graphs as the only truth |
| Shared domain core | Units, transforms, identifiers, constraints, tolerances, validation, provenance | UI component state |
| Tool module | Workflow-specific inputs, editor behavior, validation surfaces | Private redefinitions of shared units or export metadata |
| Geometry service | Deterministic generation from semantic inputs | Product meaning that cannot be reconstructed |
| Preview renderer | Derived geometry, editing aids, warnings | Hidden geometry rules not used by export |
| Export pipeline | Readiness checks, format output, metadata, warnings | Unsupported editability or fidelity claims |
| Persistence/migration | Versioned save/load/import/export and migrations | Service-hosted state as the only copy |

## Conceptual Layers

### Project/Document Model

The project model is versioned, serializable, and additive. It stores semantic inputs and user intent. It distinguishes absent, unknown, inferred, measured, and confirmed values. Unknown is not zero.

### Shared Domain Core

The shared core owns units, coordinate systems, transforms, constraints, tolerances, identifiers, validation, and provenance. It should stay pure and host-testable where practical.

### Tool Modules

Board Mount Designer is the first tool. Future tools follow [TOOL_SPEC](TOOL_SPEC.md), consume shared services through public seams, and do not import each other's internals.

### Geometry Service / Kernel Adapter

The geometry service translates canonical semantic models into exact or mesh geometry through an adapter around the selected kernel. Kernel handles and scene objects must not become the only durable representation of project meaning.

### Preview Renderer

The preview renders derived geometry and editing aids. It is never the canonical data source. Preview and export must share geometry rules or document their divergence.

### Export Pipeline

Export validates readiness, produces supported standard formats, and records units, schema version, generator version, parameters, and warnings. It must not claim editability or fidelity unsupported by the selected format.

### Persistence And Migration

Local project storage/import/export is the default candidate posture until decided otherwise. Schema versions and migration tests need to exist before user files accumulate.

### Optional Assistance Boundary

Image analysis, computer vision, or AI suggestions may propose features. Suggestions remain reviewable and cannot silently become measured facts.

### Optional Service Boundary

Authentication, cloud sync, sharing, telemetry, and collaboration are adapters around the local modeling core, not prerequisites for local utility, unless an ADR later says otherwise.

## Architecture Rules

- Canonical model over rendered scene.
- Shared code versus shared convention is decided deliberately.
- Use the two-consumer rule for abstractions, except for retrofit-expensive foundations.
- Versioning, units, coordinates, identity, migrations, provenance, and export metadata are early foundations.
- No silent stack decisions.
- No framework leakage into domain truth.
- Physical truth requires physical evidence.

## Open Technical Decisions

| Decision | Current Status | ADR |
|---|---:|---|
| Product delivery posture | Accepted | [ADR 0003](decisions/0003-local-first-product-posture.md) |
| Canonical semantic document model | Proposed | [ADR 0004](decisions/0004-canonical-semantic-document-model.md) |
| Geometry kernel | Proposed | [ADR 0005](decisions/0005-geometry-kernel-selection.md) |
| Export format contract | Proposed | [ADR 0006](decisions/0006-initial-export-format-contract.md) |
| Project schema and migrations | Proposed | [ADR 0007](decisions/0007-project-file-schema-and-migration-policy.md) |
| Image processing and privacy | Proposed | [ADR 0008](decisions/0008-image-processing-and-privacy-boundary.md) |
| Repository license and third-party policy | Proposed | [ADR 0009](decisions/0009-repository-license-and-third-party-policy.md) |
