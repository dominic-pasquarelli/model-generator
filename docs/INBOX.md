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

### CAP-20260816-01 - Prototype-to-service modular bracket system

Status: triaged

Raw note:

The owner described an older modular bracket concept whose goal was to move from proof of concept to complete projects faster: quickly printable, rigid brackets and mounts that can be used in prototypes and mount directly into final parts, similar in spirit to flight-test power packs. This could support going from breadboard to in-service hardware and upgrading later.

Historical dimensions and concepts from the note:

- slot-system center-to-center interval: 5 mm;
- female slot depth: 10 mm minimum;
- female slot width: 3.5 mm;
- female slot full length: 37.7 mm;
- female mini slot: 17.267 mm from `37.7 / 2 - slot edge spacing`;
- slot edge spacing: 1.583 mm;
- male full width: 37 mm;
- male mini width: 17 mm;
- male height: 50 mm;
- tab height: 10 mm x 2 = 20 mm;
- circle: 30 mm diameter;
- Gen 1 feature spacing: 25 mm center-to-center, minimum 3 mm from wall;
- minimum wall thickness: 3 mm;
- base thickness: 1.2 mm;
- main thickness: 11 mm;
- core exterior size: 100 x 100 mm;
- accessory exterior size: 50 x 25 mm;
- M3x10 screws;
- M3x3x5 threaded inserts with 5 mm hole diameter and 12 mm hole depth;
- magnets size TBD.

Actionable ideas from the old note:

- slot-compatible PCB layout;
- slot-compatible bracket lock adapter;
- fly-wire holders;
- support legs or dowel/extrusion adapters;
- power modules;
- holes in tabs for modular screw mounting in enclosures.

Destination or recall trigger:

Captured as product Direction in [PROJECT_VISION](PROJECT_VISION.md) and workflow implications in [BOARD_MOUNT_DESIGNER](workflows/BOARD_MOUNT_DESIGNER.md). Recall for an ADR/spike when selecting the first mount strategy or when Board Mount Designer has a basic physically validated board mount and needs reusable attachment interfaces.
