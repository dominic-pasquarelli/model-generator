---
title: Audit Log
tier: record
status: append-only
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/AUDIT.md
  - docs/DOC_SPEC.md
---

# Audit Log

## 2026-08-16 - Foundation baseline

Scope: project foundation docs, ADRs, generated map, and doc-audit tooling.

Branch/commit: foundation branch pending at time of local audit; base `main` was `d5381f0a8fca40404899f575c4441ad2d7dea1e0`.

Commands:

- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- Required canonical documents exist.
- Source provenance and inspected SHAs recorded in `docs/REFERENCES.md`.
- Product status remains foundation / pre-implementation.
- Board Mount Designer is first active value slice.
- Board Mount Assembly is future scope with recall trigger.
- Generated map matches the doc set.
- Audit tests include passing and intentionally failing fixtures.

Findings:

- ERROR: none after baseline audit.
- WARN: product delivery posture, geometry kernel, export formats, project schema, image/privacy boundary, and repository license remain Proposed.
- INFO: no product code exists, so code/document and physical-fidelity checks are limited to foundation claims.

Disposition:

- Open decisions remain in NEXT and Proposed ADRs.
- No tech debt recorded.
- No captured INBOX items recorded.

## 2026-08-16 - UI mockup direction pass

Scope: static Board Mount Designer UI mockups (`docs/design/UI_MOCKUPS.md`, `docs/design/mockups/`), UX Vision pointer, NEXT evidence update, HISTORY entry, regenerated map.

Branch/commit: `claude/app-ui-mockups-kvevmh`; base `main` was `84e343a848c374abf08bfe1b6a4792a37f4a2b03`.

Commands:

- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- New doc carries required frontmatter; image and related links resolve.
- Mockups are labeled Direction and rendered from hand-authored HTML sources committed beside the PNGs; they are not product screenshots.
- Every required early state from UX Vision is represented in the set.
- Mockup content respects the "what a mock must not promise" list: no auto-detection, no trusted dimensions without calibration, no ratified formats/kernel, no cloud/AI requirement, no physical-fit claim, style not locked.
- No product code added; `src/` still does not exist.

Findings:

- ERROR: none.
- WARN: geometry kernel, export formats, project schema, image/privacy boundary, and repository license remain Proposed, as before.
- INFO: mockups introduce fictional sample-board imagery (MG-DEV-01) drawn for this repository; Inter (SIL OFL) is used at render time but not vendored.

Disposition:

- First UX/workflow spike remains open in NEXT with the interactive flow and usability notes outstanding.
- No tech debt recorded.
- No captured INBOX items recorded.

## 2026-08-16 - Component spec and dark mode pass

Scope: `docs/design/COMPONENT_SPEC.md`, dark theme tokens in the mockup design system, three dark reference renders, UI_MOCKUPS/NEXT/HISTORY updates, regenerated map.

Branch/commit: `claude/app-ui-mockups-kvevmh`; follows the UI mockup direction pass on the same branch.

Commands:

- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- Spec tokens and metrics are extracted from `mockups/src/mockup.css`, which now implements both themes and is named the source of truth on divergence.
- Dark theme is a token swap (`:root[data-theme="dark"]`) plus enumerated component overrides; the editing canvas, status bar, and canvas-floating elements are documented as theme-invariant.
- Dark renders committed for the library, editor, and dialog-sheet screens; `render.sh` reproduces them.
- Spec repeats no authority it does not have: kernel, export formats, schema, privacy boundary, license, responsive breakpoints, and final style ratification remain explicitly open.

Findings:

- ERROR: none.
- WARN: none new; open Proposed decisions unchanged.
- INFO: contrast pairs are asserted from the palette and should be re-verified with a contrast checker during the Phase 1 skeleton.

Disposition:

- Component extraction into shared packages stays deferred per ADR 0003 until a real second consumer exists.
- No tech debt recorded.
- No captured INBOX items recorded.

