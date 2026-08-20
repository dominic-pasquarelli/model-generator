---
title: Audit Log
tier: record
status: append-only
updated: 2026-08-20
audited: 2026-08-20
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

## 2026-08-16 - Tooling hardening review follow-up

Scope: review findings against commit `8ba847e`, doc-audit map-date tests, `write_map` date churn, Python fallback documentation duplication, mockup render screenshot validation, NEXT/HISTORY closeout.

Branch/commit: local `main`; follow-up changes pending commit at audit time.

Commands:

- `python tools/doc-audit/doc_audit.py --write-map`
- `python tools/doc-audit/doc_audit.py --check`
- `python -m unittest discover tools/doc-audit/tests`

Evidence:

- The date-drift regression test now asserts the old fixture date is actually present, so a broken `generate_map(..., updated=...)` parameter cannot pass trivially.
- `write_map` preserves the existing `docs/MAP.md` `updated` date when the generated map content is otherwise unchanged, avoiding date-only closeout diffs.
- Windows Python fallback wording has one canonical home in Onboarding; other mentions link there.
- `render.sh` no longer suppresses Chromium stderr and fails when the screenshot is smaller than 2880x1800 instead of allowing Pillow to pad the image.

Findings:

- ERROR: none after audit.
- WARN: no new product warnings; open Proposed ADR decisions remain as before.
- INFO: product code still does not exist.

Disposition:

- NEXT still points to the geometry/export spike and STEP/Fusion evidence as the next blocking work.
- No tech debt recorded.
- No captured INBOX items recorded.

## 2026-08-17 - Phase 1 app skeleton and interactive spike

Scope: first product code under `src/` (React + Vite + TypeScript Board Mount Designer shell + interactive editor + canonical model + validation + illustrative generator + export pipeline), Playwright e2e, five proposed `docs/plans/` feature plans, doc-audit ignore-list for vendored/build output, README/AGENTS/NEXT/ONBOARDING/HISTORY closeout, regenerated map.

Branch/commit: `claude/app-ui-shell-features-3hg2jc`; base `main` at branch point `43b2dbc`.

Commands:

- `pnpm run typecheck` · `pnpm test` · `pnpm run build` · `pnpm exec playwright test`
- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- 26 host-level unit tests pass (units/calibration transform + plausibility rejection, schema load/save + v0→v1 migration + corrupt-file handling, validation severity + export readiness, generation determinism and guards).
- 6 Playwright cases pass headless against a production build: library seed, theme toggle, sample project auto-generates and enables export, export reaches complete, required-states showcase, and new-project → add reference → reject-then-accept calibration.
- `tsc -b` typechecks the app and node configs; `vite build` bundles (86 modules).
- doc-audit tests still pass; the audit now skips `node_modules`/build output and PASSes with one INFO ("product code exists").

Findings:

- ERROR: none after audit.
- WARN: geometry kernel, STEP/STL export support, hardened project file schema, image/privacy boundary, and repository license remain Proposed; each deferred feature now has a `proposed` plan under `docs/plans/`.
- INFO: the 3D bracket, generated dimensions, and exported artifacts are illustrative/placeholder — no kernel, no valid STEP body, and no physical fit are claimed. The units toggle stores the unit but the inspector still renders values in millimetres.

Disposition:

- NEXT points to the geometry/export spike (real kernel behind the existing `GeometryAdapter`, then STEP + Fusion evidence) as the next blocking work; the shell is ready for reviewer feedback.
- No tech debt recorded (the mm-only rendering under the inch toggle is noted here and in NEXT rather than as a TECH_DEBT id).
- No captured INBOX items recorded.

## 2026-08-17 - Third-party review response

Scope: implemented the six shell-level merge-blockers from an external review of PR #5 — custom-reference import through the canonical store path with error surfacing and two-click bounds-checked calibration; persistence-with-result + explicit save state + corrupt-data recovery key + deep parse validation + honest library copy/controls + durable saved boards; a canonical board-space `generationKey` with recomputed freshness and async-supersede; core domain-validity errors and readiness blockers; `NumberField` single-commit/precision/min-max via a pure `resolveCommit`; and an honest export lifecycle where records are written only on download. No deferred work (kernel, `.mgproj` container, camera/skew, full CI/a11y) was pulled in.

Branch/commit: `claude/app-ui-shell-features-3hg2jc`; follows the Phase 1 spike on the same branch.

Commands:

- `pnpm run typecheck` · `pnpm test` · `pnpm run build` · `pnpm exec playwright test`
- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- 60 host-level unit tests pass, including jsdom store tests for QuotaExceededError → error save state, malformed-whole-library and single-malformed-project recovery (survivors kept, corrupt data quarantined), a delayed-adapter generation race proving a stale result is discarded, keep-out shape-change geometry consistency, and export prepared-vs-downloaded-vs-current semantics; plus pure tests for `generationKey` invariants (whole-definition translation stable; outline move / calibration change / distinct same-bbox polygons all change the key), `resolveCommit`, and domain-validity rejections.
- 9 Playwright cases pass headless against a production build, adding: PNG upload persisted across reload, two-click endpoint-placement calibration (reject then accept), keep-out shape change, and closing the export dialog without downloading not claiming an export.
- `tsc -b` typechecks; `vite build` bundles; doc-audit PASS; doc-audit tests pass.

Findings:

- ERROR: none after audit.
- WARN: the deferred decisions (kernel, STEP/Fusion, project file schema, image/privacy, license) remain Proposed with plans under `docs/plans/`.
- INFO: exported artifacts remain labelled placeholders (no kernel); the inch unit option is intentionally disabled until conversion is wired; circle/polygon keep-outs can be created by shape change but not yet edited numerically.

Disposition:

- The shell is internally correct and no longer claims calibrated/saved/current/exported states it has not established; re-review requested at the updated head.
- No tech debt recorded.
- No captured INBOX items recorded.


## 2026-08-19 - Real solid, exports, 3D, and usability sprint

Scope: real geometry generator, STL + faceted-B-rep STEP export, live 3D preview of the generated solid, `.mgproj` save/open, mm/inch display, undo/redo; ADRs 0005/0006/0007 accepted; README, AGENTS, NEXT, HISTORY updated; regenerated map.

Branch/commit: `claude/sprint-functionality-build-617mjf`; base `main` was `566c190` (merge of PR #5).

Commands:

- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- 79 host-level unit tests pass, including a per-body manifold audit of the generated solid (each directed edge once, each undirected edge shared by two triangles, Euler V−E+F=2), STL facet-per-triangle + determinism, STEP structural validity (reference-complete graph, one closed shell per body, one ADVANCED_FACE per triangle, every edge shared by exactly two faces with opposite ORIENTED_EDGE sense), 3D projection determinism + culling, undo/redo, `.mgproj` round-trip, and unit formatting.
- 9 Playwright cases pass headless against a production build; the mount and export views now render the actual generated solid.
- `tsc -b` typechecks; `vite build` bundles; doc-audit PASS; doc-audit tests pass.

Findings:

- ERROR: none after audit.
- WARN: the STEP is a faceted B-rep and the Fusion import evidence gate is still open (no `evidence/fusion-import/` record); printed-part fit is unverified; automatic board detection and camera/skew-aware calibration remain unbuilt; no CI yet.
- INFO: reference images embed as data-URL `src` inside the `.mgproj` JSON (large photos bloat the file — ADR 0007 open refinement); the illustrative mock generator is retained for store-test isolation.

Disposition:

- Geometry kernel (ADR 0005), export format (ADR 0006), and project file schema (ADR 0007) moved from Proposed to Accepted, each with the honest boundary of what remains unproven recorded in-ADR.
- No tech debt recorded.
- No captured INBOX items recorded.

## 2026-08-20 - Independent-review response: full-scope pass

Scope: implemented every behavioral blocker from the independent review of the sprint PR (rather than narrowing controls) — single connected watertight manifold with real control semantics, no silently-invented dimensions, artifact-units vs display-units split with a full auditable parameter sidecar, one provenance for preview and metadata, monotonic project-version through undo/redo, and `.mgproj` hardened as an untrusted boundary; ADR 0004 promoted Proposed → Accepted; persistence-plan status contradiction resolved; README, AGENTS, NEXT, HISTORY updated; regenerated map.

Branch/commit: `claude/sprint-functionality-build-617mjf` (this pass: `544ec5f`, `d2a0eef`, `3b29e4a`, `e978197`, `47f6a4d` + docs); base `main` at `84e343a`.

Commands:

- `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:e2e`
- `python3 tools/doc-audit/doc_audit.py --write-map`
- `python3 tools/doc-audit/doc_audit.py --check`
- `python3 -m unittest discover tools/doc-audit/tests`

Evidence:

- 129 host-level unit tests pass, including an AGGREGATE manifold audit of the whole generated solid (one connected component via union-find, every undirected edge shared by exactly two triangles, every directed edge exactly once → watertight + consistently oriented), `poly2d` (hull/offset/ring-overlap) and `triangulate` (earcut with 0–5 holes) unit suites, exporter geometry-units-vs-display-units and full parameter-snapshot tests, a preview-provenance regression pinning the auto-generate-off edit case (dims track the live build, never the stale record), undo/redo strictly-increasing-version tests, and the malformed-`.mgproj` rejection suite.
- 9 Playwright cases pass headless against a production build.
- `tsc -b` typechecks; `vite build` bundles (97 modules); doc-audit PASS; its 10 unit tests pass.

Findings:

- ERROR: none after audit.
- WARN: the STEP is a faceted B-rep and the Fusion import evidence gate is still open (no `evidence/fusion-import/` record); printed-part fit is unverified; automatic board detection and camera/skew-aware calibration remain unbuilt; no CI yet.
- INFO: reference images embed as data-URL `src` inside the `.mgproj` JSON (ADR 0007 open refinement); the illustrative mock generator is retained for store-test isolation.

Disposition:

- Canonical semantic document model (ADR 0004) moved Proposed → Accepted; it is the load-bearing source of truth and ADR 0007 no longer depends on a Proposed decision.
- Persistence plan set to `status: living` with a precise Built-vs-proposed split replacing the earlier "nothing is Built" contradiction.
- No tech debt recorded.
- No captured INBOX items recorded.
