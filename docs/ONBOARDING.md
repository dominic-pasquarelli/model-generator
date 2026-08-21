---
title: Onboarding
tier: meta
status: living
updated: 2026-08-17
audited: 2026-08-17
related:
  - AGENTS.md
  - docs/NEXT.md
  - docs/AUDIT.md
---

# Onboarding

## Current Repository State

The repository contains a Phase 1 React + Vite + TypeScript app under `src/` implementing the Board Mount Designer shell and interactive spike, plus the documentation foundation. No geometry kernel is selected yet, so the generator is an illustrative mock and there is no valid CAD export.

## First Read

1. Read [AGENTS.md](../AGENTS.md).
2. Read [NEXT.md](NEXT.md).
3. Read [PROJECT_VISION.md](PROJECT_VISION.md).
4. Read [BOARD_MOUNT_DESIGNER.md](workflows/BOARD_MOUNT_DESIGNER.md).

## App Commands

With Node 20+ and pnpm:

```bash
pnpm install
pnpm dev                    # local dev server
pnpm test                   # host-level unit tests
pnpm run typecheck
pnpm run build
pnpm exec playwright test   # headless browser journey
```

Playwright uses the environment's pre-installed Chromium; `playwright.config.ts` discovers it under `PLAYWRIGHT_BROWSERS_PATH` and never triggers a download.

## Documentation Commands

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

Windows note: use `python` for the same commands if `python3` resolves to the WindowsApps Store shim or is otherwise unavailable.

## Before Extending Beyond The Shell

The app shell is built on the Cadence-adjacent browser-first stack (ADR 0003). Before wiring the deferred features — a real geometry kernel, STEP export, a hardened project file format, camera/skew calibration — resolve or deliberately spike the owner decisions listed in [NEXT.md](NEXT.md) and follow the matching plan under [`docs/plans/`](plans/). Keep new geometry behind the keyed build-service seam (`buildBracketMesh` → `MeshResult`, run off-thread by `geometryWorker.ts`/`buildClient.ts` and cached by generation key) and keep unknown values distinct from zero.
