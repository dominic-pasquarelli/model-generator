---
title: Operating Model
tier: meta
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/PROJECT_VISION.md
  - docs/DOC_SPEC.md
  - docs/AUDIT.md
  - docs/NEXT.md
---

# Operating Model

## Built In Bursts

Model Generator is expected to be developed in bursts. The repository must therefore restore context for a cold reader: what is settled, what is active, what is parked, what evidence exists, and what the next exact action is.

Documents are not decoration here. They are the restore mechanism.

## Bank Value One Tool At A Time

Each finished tool should remove a real modeling inconvenience. Board Mount Designer is the first test of that principle. It should be useful before Board Mount Assembly or any broader platform exists.

The project should resist becoming a framework project that spends its energy on speculative infrastructure. Leave seams clean, then promote shared code when a real second consumer exists or when a foundation would be expensive to retrofit.

## Capture Is Cheap, Building Costs

Ideas belong in INBOX until they become active work, ADRs, workflow docs, or tech debt. Captured ideas do not become requirements by age or repetition. They need a destination, a recall trigger, or an explicit decline.

## Evidence Ladder

Generated and visual success can be useful, but it cannot outrank physical evidence:

| Claim | Minimum Evidence |
|---|---|
| Documentation foundation is coherent | Mechanical audit plus judgement pass. |
| Domain rule works | Host-level test. |
| Editor interaction works | Browser-level or equivalent UI test. |
| Geometry is structurally valid | Generated-geometry-level check appropriate to the format. |
| Export is suitable for a downstream workflow | Import or round-trip evidence in the named downstream tool. |
| Part physically fits | Printed-part-level or physical assembly-level evidence. |

## Semantic Definitions Are The Connective Tissue

Future composition depends on retaining meaning: board outline, holes, keep-outs, connector envelopes, clearances, ports, source measurements, and uncertainty. Exported meshes are useful outputs, but they are not the project source of truth.

## Closeout Discipline

A phase ends resumable. That means NEXT is current, HISTORY records what actually landed, ADR status matches reality, the map is regenerated, and an audit entry names the evidence and remaining decisions.

