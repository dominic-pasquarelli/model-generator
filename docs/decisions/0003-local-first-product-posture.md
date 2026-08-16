---
title: ADR 0003 Local-First Product Posture
tier: decision
adr: 0003
status: accepted
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/UX_VISION.md
  - docs/NEXT.md
---

# ADR 0003 - Local-First Product Posture

## Status

Accepted.

## Question

What product delivery posture should the MVP use?

## Decision

Use a **Cadence-adjacent local-first browser stack** for the first implementation:

- TypeScript;
- React + Vite UI;
- Tailwind-compatible styling and the same general component vocabulary used by Cadence/Axon web surfaces where practical;
- Node-based workspace scripts and local commands;
- browser-first app shell for image/reference editing and 3D preview;
- Electron-compatible structure so a desktop wrapper remains a realistic path;
- no mandatory account or cloud dependency for the MVP.

The app should stay close enough to Cadence that UI components, interaction patterns, and possibly extracted shared packages can be reused later. Do not directly couple Model Generator to Cadence or Axon internals during the MVP.

## Context

The owner wants a stack similar to Cadence because it supports browser-based work, keeps Electron possible, and improves the odds that useful components or conventions can be shared between Model Generator, Axon, and Cadence.

Cadence currently uses a React/Vite/Tailwind TypeScript UI with Node workspace scripts and an Electron shell path. Model Generator should follow that family unless a measured geometry/export constraint forces a bounded exception.

## Consequences

- Product app scaffolding is unblocked after the MVP decision packet defines the geometry/export spike.
- ADR 0005 still owns geometry-kernel choice.
- ADR 0006 still owns export format proof and Fusion evidence.
- A local helper, worker, or Electron packaging path may be introduced if STEP generation cannot run cleanly in the browser.
- Shared components should be extracted only after a real second consumer exists or a stable design-system contract emerges.
- The MVP must not import private Cadence/Axon implementation details simply because the stack is similar.
