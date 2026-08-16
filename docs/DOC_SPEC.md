---
title: Documentation Specification
tier: meta
status: stable
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/AUDIT.md
  - docs/MAP.md
  - docs/decisions/0002-load-bearing-documentation-and-audit.md
---

# Documentation Specification

## Purpose

Documentation is load-bearing because this project will be built in bursts. The goal is a small set of records with distinct jobs, not a large set of repeated essays.

## Placement Rules

- Project-wide product, architecture, process, and audit docs live in `docs/`.
- Workflow docs live in `docs/workflows/` until code exists and a tool-local doc home is justified.
- ADRs live in `docs/decisions/` as one chronological project log.
- `AGENTS.md` is the canonical agent-governance file. `CLAUDE.md` is a pointer only.
- `docs/MAP.md` is generated.

## Frontmatter

Canonical Markdown documents use YAML frontmatter:

```yaml
---
title: Short Title
tier: meta
status: living
updated: YYYY-MM-DD
audited: YYYY-MM-DD
related:
  - docs/PROJECT_VISION.md
---
```

Required fields:

| Field | Meaning |
|---|---|
| title | Human title used by the generated map. |
| tier | `meta`, `platform`, `tool`, `workflow`, `decision`, or `record`. |
| status | `proposed`, `living`, `stable`, `frozen`, `historical`, `append-only`, or `generated`. |
| updated | Last substantive edit or reconfirmation. |
| audited | Last accuracy review against current code, decisions, and claims. |
| related | Local links to canonical neighbors. |

Generated, append-only, and buffer-style records may omit `audited` when the omission is documented, but this foundation keeps `audited` on all canonical docs for a clean baseline.

## Dates

- `updated` changes when the document meaning changes.
- `audited` changes when the document is re-read against current source truth and still matches.
- Time-based staleness is advisory, not an automatic merge failure.

## ADR Format

ADRs use the same frontmatter plus:

- `adr: NNNN`;
- `status: accepted`, `proposed`, `superseded`, or `rejected`;
- `date: YYYY-MM-DD`.

ADRs may be Proposed by an agent. They become Accepted only by owner authority or explicit governing instruction.

## One Concern, One Home

Repeat only short summaries. Link to the canonical home for details. If two docs drift, fix the home and replace the duplicate with a pointer.

## Map

Regenerate `docs/MAP.md` with:

```bash
python3 tools/doc-audit/doc_audit.py --write-map
```

The audit checks that the generated region matches the current doc set.

## Closeout

Every branch or phase closeout should:

1. update active work in NEXT;
2. drain completed work to HISTORY;
3. update or add ADRs;
4. update INBOX and TECH_DEBT as needed;
5. regenerate MAP;
6. run the audit and tests;
7. add an audit-log entry.

