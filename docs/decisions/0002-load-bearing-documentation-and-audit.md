---
title: ADR 0002 Load-Bearing Documentation And Audit
tier: decision
adr: 0002
status: accepted
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/DOC_SPEC.md
  - docs/AUDIT.md
  - docs/MAP.md
---

# ADR 0002 - Load-Bearing Documentation And Audit

## Status

Accepted.

## Context

The owner explicitly requested that Model Generator borrow the documentation handling and auditing practices that have worked in Axon, Cadence, and the NetSuite Middleware System, scaled for a new repository.

## Decision

Model Generator uses load-bearing documentation from day one:

- one concern, one canonical home;
- frontmatter with `updated` and `audited`;
- NEXT/HISTORY/INBOX/TECH_DEBT/audit-log lifecycle;
- unified ADRs under `docs/decisions/`;
- generated `docs/MAP.md`;
- local closeout audit.

## Consequences

- Documentation and code claims must move together once code exists.
- Active work lives in NEXT; completed work drains to HISTORY.
- Captured ideas need destinations or recall triggers.
- Accepted debt needs stable IDs and triggers.
- A branch or phase is not complete until the mechanical audit and judgement pass are recorded.

