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

## 2026-08-16 - UI direction owner approval

Scope: ADR 0011 (accepted), status updates in UI_MOCKUPS/COMPONENT_SPEC/NEXT, decision-log index, `.gitignore` for Python bytecode, regenerated map.

Branch/commit: `claude/app-ui-mockups-kvevmh`; follows the component spec and dark mode pass.

Commands:

- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- ADR 0011 records the owner's explicit 2026-08-16 instruction as its acceptance authority and scopes approval to the guiding UI direction.
- Approval does not touch open ADRs (0004–0009), does not mark anything Built or Verified, and keeps the direction refinable through review rather than frozen.
- All twelve reference PNGs are committed in `docs/design/mockups/` and embedded in UI_MOCKUPS.md; the spec, mockups, and ADR cross-link.

Findings:

- ERROR: none.
- WARN: none new.
- INFO: none.

Disposition:

- The UX spike proceeds against an owner-approved target; deviations found there feed back through review per ADR 0011.
- No tech debt recorded.
- No captured INBOX items recorded.

## 2026-08-16 - Local setup and Phase 0 hardening

Scope: merged UI direction PR, local Windows setup friction, doc-audit generated-map determinism, mockup render portability, Proposed ADR spike scopes, NEXT/HISTORY closeout.

Branch/commit: local `main` after GitHub squash merge `45d5a73eff77427280615b7d6becc6ba632efd38`; follow-up changes pending commit at audit time.

Commands:

- `python tools/doc-audit/doc_audit.py --write-map`
- `python tools/doc-audit/doc_audit.py --check`
- `python -m unittest discover tools/doc-audit/tests`

Evidence:

- PR #4 was merged on GitHub, bringing ADR 0011, UI_MOCKUPS, COMPONENT_SPEC, mockup PNGs, source HTML/SVG/CSS, and `.gitignore` into `main`.
- `doc_audit.generate_map` now preserves the existing `docs/MAP.md` `updated` date during checks while `--write-map` still stamps a fresh date.
- The doc-audit test suite has a regression test proving date-only map drift does not trigger `generated map is out of date`.
- Windows command notes now document `python` as the fallback when `python3` is unavailable.
- Mockup rendering now accepts `PYTHON_BIN` so Windows/Git Bash users can point the crop step at `python`.
- ADRs 0004-0008 contain concrete Phase 0 spike scopes without changing their Proposed status.
- Local repo config was set to use `.git/info/exclude`, eliminating the inaccessible user-level ignore-file warning for this checkout.

Findings:

- ERROR: none after audit.
- WARN: geometry kernel, export format support, final project file format, image/privacy boundary, repository license, modular attachment scope, and physical-validation fixture remain open owner/evidence decisions.
- INFO: product code still does not exist; all new implementation guidance is Proposed spike scope or accepted UI direction.

Disposition:

- NEXT now points to running the geometry/export spike against the semantic fixture and recording STEP/Fusion evidence.
- No tech debt recorded.
- No captured INBOX items recorded.

