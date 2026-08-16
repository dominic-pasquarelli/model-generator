---
title: Inbox
tier: record
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/NEXT.md
  - docs/TECH_DEBT.md
---

# INBOX

## Purpose

INBOX is a low-friction capture buffer. It is not authority and not a permanent archive.

## Capture Format

```text
### CAP-YYYYMMDD-NN - Short title
Status: captured | triaged | promoted | landed | declined
Raw note:
Destination or recall trigger:
```

Deferred items need a recall trigger. Promoted items link to NEXT, an ADR, a workflow doc, or TECH_DEBT. Landed items move to HISTORY or the relevant canonical document.

## Captured

None recorded.

