---
title: ADR 0009 Repository License And Third-Party Policy
tier: decision
adr: 0009
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/REFERENCES.md
  - docs/ARCHITECTURE.md
---

# ADR 0009 - Repository License And Third-Party Policy

## Status

Proposed. Owner decision needed.

## Question

What license should Model Generator use, and what third-party code/assets may be adopted?

## Current Facts

- Model Generator currently has no selected repository license.
- Gridfinity Layout Tool is licensed AGPL-3.0-only according to its README and package metadata.
- Gridfinity Layout Tool is a reference product, not a donor codebase.

## Proposed Rule

Do not copy third-party source, screenshots, assets, prose, distinctive styling, or AGPL-covered implementation without explicit owner approval and a licensing ADR.

## Work Blocked

Adopting third-party geometry or UI implementation dependencies as project foundations.

