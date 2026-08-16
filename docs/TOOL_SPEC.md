---
title: Tool Specification
tier: platform
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# Tool Specification

Every modeling tool must eventually declare the contract below. Early documents may mark fields Proposed or Future when implementation has not started.

## Required Tool Contract

- stable tool identifier and human name;
- problem and supported workflow;
- inputs and their authority/provenance;
- output semantic model;
- units and coordinate-system assumptions;
- required and optional fields;
- validation rules and error classes;
- derived preview contract;
- generation/export contract;
- persistence and schema version;
- migration behavior;
- undo/redo transaction boundaries;
- accessibility and keyboard expectations;
- deterministic test fixtures;
- geometry invariants;
- evidence required before physical-validation claims;
- README or local documentation stating built, unbuilt, and next work;
- relevant ADR links.

## Ownership Rules

A new tool should be addable without editing unrelated tool internals. Tools may use shared primitives, but must not privately redefine units, coordinate transforms, project identity, export metadata, migrations, validation severity, or provenance.

## Shared Code Versus Shared Convention

Use this propagation decision:

```text
Found something bespoke in tool X:
1. Would a real second tool need the same implementation?
   No -> leave it local; keep the seam clean.
2. Is it shared units, transforms, constraints, provenance, persistence, generation, or export behavior?
   Yes -> lift one implementation behind a shared seam.
3. Is it a convention every tool must follow rather than shared code?
   Yes -> promote it to TOOL_SPEC and open conformance work.
4. Is the tradeoff non-obvious or expensive to reverse?
   Yes -> ADR before propagation.
```

## Conformance

Before a tool is called Built, it needs local documentation, deterministic fixtures, and tests for its shared contract points. Before it is called physically verified, it needs named physical evidence.

