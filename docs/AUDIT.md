---
title: Audit Protocol
tier: meta
status: stable
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/DOC_SPEC.md
  - docs/audit-log.md
  - tools/doc-audit/README.md
---

# Audit Protocol

## Mechanical Audit

Run:

```bash
python3 tools/doc-audit/doc_audit.py --check
```

On Windows, use `python` in place of `python3` if the `python3` launcher is unavailable.

The checker validates required documents, frontmatter, link targets, ADR numbering, ADR index coverage, TECH_DEBT IDs, generated map drift, duplicate headings, agent-governance duplication, NEXT resume anchor, and INBOX/TECH_DEBT lifecycle basics.

Severity:

| Severity | Meaning |
|---|---|
| ERROR | Objective foundation breakage; blocks closeout. |
| WARN | Likely drift or judgement boundary. |
| INFO | Recall, staleness, duplication, or review prompt. |

## Judgement Lenses

The mechanical audit is not enough. Before shelving major work, walk these lenses and record the outcome in [audit-log](audit-log.md).

### Lens A - Code / Document Alignment

- Does every Built, supported, and Verified claim match evidence?
- Are documented-but-unbuilt items labeled Direction, Proposed, Experiment, or Future possibility?
- Is notable built behavior documented?
- Do README, AGENTS, architecture, workflow docs, ADRs, and NEXT agree?

### Lens B - Modularity And Reuse

- Is a tool privately rebuilding something another tool would need?
- Does shared code belong in the domain core, geometry service, persistence, or export layer?
- Is a shared convention captured in TOOL_SPEC?
- Is an abstraction speculative?
- Are tool boundaries intact?

### Lens C - Resumability

- Could a cold reader resume in under an hour?
- Does NEXT name an exact next step?
- Are setup, tests, fixtures, limitations, and required evidence documented?
- Is the branch left coherent and testable?

### Lens D - Product And Usability Fidelity

- Does the work reduce modeling friction?
- Can a basic user complete the simple path without advanced internals?
- Are direct manipulation and exact values consistent?
- Are unknown, inferred, measured, confirmed, generated, and verified states distinct?
- Are errors actionable and operations reversible?
- Is optional cloud or AI assistance still optional unless ratified?

### Lens E - Recall And Lifecycle

- Did a deferred item's trigger fire?
- Did shipped work leave NEXT and enter HISTORY?
- Did an implemented Proposed ADR get accepted or closed?
- Did an INBOX item land but remain captured forever?
- Is accepted debt still latent, now active, or paid?

### Lens F - Geometry And Physical Fidelity

- Are units and coordinate systems explicit and centrally enforced?
- Are pixels being mistaken for physical dimensions?
- Are tolerances and clearances named?
- Do preview and export consume the same canonical geometry path?
- Are geometry checks appropriate to the output?
- Are physical-fit claims backed by named fabricated evidence?
- Is no data distinct from zero?

### Lens G - Forward Compatibility, Privacy, And Licensing

- Can project files evolve additively?
- Are source assets and measurements portable and recoverable?
- Is local use possible without an account if that posture is ratified?
- Are board images handled according to the privacy boundary?
- Are dependencies and copied assets license-compatible?
- Does export declare limitations?

## Audit Log Entry Format

Each deep audit entry records date, scope, branch/commit, commands, evidence, findings by severity/lens, disposition, renewed `audited` dates, and remaining owner decisions.

