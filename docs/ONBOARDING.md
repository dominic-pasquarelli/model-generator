---
title: Onboarding
tier: meta
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - AGENTS.md
  - docs/NEXT.md
  - docs/AUDIT.md
---

# Onboarding

## Current Repository State

This is a foundation repository. There is no product app, no selected runtime, no geometry kernel, and no product build command yet.

## First Read

1. Read [AGENTS.md](../AGENTS.md).
2. Read [NEXT.md](NEXT.md).
3. Read [PROJECT_VISION.md](PROJECT_VISION.md).
4. Read [BOARD_MOUNT_DESIGNER.md](workflows/BOARD_MOUNT_DESIGNER.md).

## Commands That Exist Today

Regenerate the documentation map:

```bash
python3 tools/doc-audit/doc_audit.py --write-map
```

Run the mechanical documentation audit:

```bash
python3 tools/doc-audit/doc_audit.py --check
```

Run the audit tool tests:

```bash
python3 -m unittest discover tools/doc-audit/tests
```

## Before Starting Product Code

Resolve or deliberately spike the owner decisions listed in [NEXT.md](NEXT.md), especially project schema, geometry kernel, export formats, image/privacy boundary, and first physical-validation fixture. ADR 0003 already selects the Cadence-adjacent browser-first stack with an Electron-compatible path.
