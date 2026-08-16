---
title: References
tier: meta
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/UX_VISION.md
  - docs/decisions/0009-repository-license-and-third-party-policy.md
---

# References

Inspection date: 2026-08-16.

## Source Provenance

| Source | Role | Branch | Commit SHA | License Note |
|---|---|---:|---|---|
| `dominic-pasquarelli/model-generator` | Target seed | `main` | `d5381f0a8fca40404899f575c4441ad2d7dea1e0` | No repository license selected. |
| `dominic-pasquarelli/Axon` | Documentation and audit precedent | `main` | `f17c1dcc9fc2c1a714003245f4df7c7139dbb896` | No transplant of text or tooling. |
| `dominic-pasquarelli/Cadence` | Vision/status labeling precedent | `dev` | `7cb3bb6c6c9085b26cd5259ee7b5785b1ffe7625` | No transplant of text or tooling. |
| `dominic-pasquarelli/02182026095930---NetSuite-Middleware-System` | Module contract and governance precedent | `main` | `8053ec7d291e0c0571fa911b972e82cfc2a4608d` | No transplant of text or tooling. |
| `andymai/gridfinity-layout-tool` | Product usability reference | `main` | `b88dd2ed1b085e069b3bc2a4643c6eb1bad4aa3d` | README and `package.json` identify AGPL-3.0-only. Reference only. |

## Files Inspected

### Axon

- `AGENTS.md`
- `docs/DOC_SPEC.md`
- `docs/AUDIT.md`
- `docs/OPERATING_MODEL.md`
- `docs/NEXT.md`
- `docs/HISTORY.md`
- `docs/INBOX.md`
- `docs/TECH_DEBT.md`
- `docs/MAP.md`
- `docs/decisions/`

Principles adopted: load-bearing docs, separate updated/audited freshness, generated map, audit lenses, NEXT/HISTORY/INBOX/TECH_DEBT lifecycle, recall triggers, freeze concept, and phase closeout discipline.

Things deliberately not adopted: Axon's embedded-platform vocabulary, engine hierarchy, hardware-specific gates, large mature NEXT/HISTORY scale, and any source text.

### Cadence

- `AGENTS.md`
- `docs/NEXT.md`
- `docs/HISTORY.md`
- `docs/INBOX.md`
- `docs/design/DESIGN_MODE_VISION.md`
- `docs/decisions/`

Principles adopted: clear separation between ratified direction, visual direction, unbuilt scope, active lane, parked scope, and things a mock must not promise.

Things deliberately not adopted: music/show domain model, Axon boundary specifics, existing UI terminology, and any source text.

### NetSuite Middleware System

- `AGENTS.md`
- `docs/DOC_SPEC.md`
- `docs/AUDIT.md`
- `docs/ARCHITECTURE.md`
- `docs/MODULE_SPEC.md`
- `docs/TECH_DEBT.md`
- `docs/NEXT.md`
- `docs/MAP.md`
- `docs/decisions/`

Principles adopted: stable debt IDs, module/tool contract thinking, distinction between shared implementation and shared convention, additive schema/migration posture, and governance around reusable modules.

Things deliberately not adopted: NetSuite deployment model, SuiteScript conventions, governance-unit specifics, financial-trust terminology, and any source text.

### Gridfinity Layout Tool

- `README.md`
- `CLAUDE.md`
- `package.json`
- `src/features/` organization
- Root listing confirming `LICENSE`

Principles adopted: focused 3D utility, direct manipulation, parametric editing, 2D planning plus 3D preview, no-account local usefulness, optional sync/services, standard export expectations, and feature-based workspace organization.

Things deliberately not adopted: Gridfinity feature list, source code, screenshots, assets, prose, visual identity, implementation structure, dependencies, and AGPL-covered implementation.

## Licensing Boundary

Gridfinity Layout Tool is a reference product only. Do not copy its source, screenshots, assets, prose, distinctive visual design, or AGPL-covered implementation into Model Generator without an explicit owner-approved licensing ADR.

The Model Generator repository itself has no selected license at this foundation point. See [ADR 0009](decisions/0009-repository-license-and-third-party-policy.md).

