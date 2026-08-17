---
title: Testing, Accessibility and CI Plan
tier: workflow
status: proposed
updated: 2026-08-17
audited: 2026-08-17
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0009-repository-license-and-third-party-policy.md
---

# Testing, Accessibility and CI Plan

## Purpose And Scope

This plan specifies the quality system a reviewer uses to trust the Board Mount Designer without
running it by hand: the test matrix, the accessibility conformance plan, and the CI wiring. It is a
forward-looking plan (status: proposed). Nothing here is Built or Verified until it exists in code
with named evidence.

Honest starting point (evidence: repository inspection, 2026-08-17): `package.json` declares scripts
`typecheck`, `lint`, `test` (vitest run), `test:e2e` (playwright test), and `build`;
`vitest.config.ts` and `playwright.config.ts` exist. But `lint` merely aliases `tsc -b --noEmit`
(no real linter), and there are zero `*.test.ts(x)` files, zero `tests/e2e` specs, no `.github/`
workflow, and no `.claude/` SessionStart hook — `src/` holds only `styles/*.css`.

So the harness is scaffolded but empty. This plan turns that scaffold into gates. It does not decide
the geometry kernel, export format, schema, image boundary, or license — those remain with their
ADRs. Generated-geometry and export tests are specified but gated behind the kernel landing (`ADR
0005`) and export contract (`ADR 0006`).

## Where It Fits

The test layers map one-to-one onto the architecture seams in `docs/ARCHITECTURE.md` and the
evidence ladder in `docs/workflows/BOARD_MOUNT_DESIGNER.md`:

| Architecture seam | Test layer | Evidence-ladder rung |
|---|---|---|
| Shared domain core (units, transforms, validation) | vitest unit, `environment: node` | host-level |
| Project/document model + persistence/migration | vitest schema/migration fixtures | host-level |
| Tool module editor + app shell | Playwright browser journey + component a11y | browser-level |
| Geometry service / kernel adapter | generated-dimension tests (gated on `ADR 0005`) | generated-geometry-level |
| Preview renderer / export pipeline | non-empty-scene smoke; STEP readiness + round-trip | browser-level, then printed-part-level via Fusion gate (`ADR 0006`) |
| UI fidelity (COMPONENT_SPEC) | Playwright screenshot diff @ 1440x900, light + dark | browser-level |

Domain tests must not import React or the DOM (they stay pure per the architecture rule "no framework
leakage into domain truth"); `vitest.config.ts` already pins `environment: node` for exactly this.
Browser-level DOM work belongs to Playwright, which drives the built `preview` server.

## Candidate Approaches

Three decisions shape the system. Each has a decision gate that points at the owning ADR where a
dependency choice is license-affecting.

### Approach trade-offs

| Decision | Option A | Option B | Trade-off |
|---|---|---|---|
| Component/a11y harness | Playwright-only (browser real DOM) | vitest + `@testing-library/react` + jsdom for components, Playwright for journeys | A is one runtime, slower feedback, real focus/AT semantics; B gives fast host-level component tests but jsdom fakes focus/layout, so a11y focus-ring and contrast still need Playwright |
| Automated a11y scan | `@axe-core/playwright` (axe rules) | hand-rolled assertions only | axe covers ~40% of WCAG mechanically, cheap; but axe-core is MPL-2.0 — a dev-dependency license question for `ADR 0009` |
| Visual fidelity | Playwright `toHaveScreenshot` (built-in pixel diff) | external `pixelmatch` + committed PNGs | built-in manages baselines and threshold; external is more code but decouples from Playwright's snapshot format |
| Contrast checking | runtime token parse + WCAG 2 ratio (`wcag-contrast`/`culori`) | manual spreadsheet audit | automated catches regressions when tokens change; manual rots immediately |

### Decision gates

- G1 (harness): adopt B (vitest + Testing Library for components, Playwright for journeys) only if
  `@testing-library/react` + `@testing-library/user-event` + `jsdom` clear the third-party policy in
  `ADR 0009` (all are MIT — expected pass). Focus order, the 3px ring, and contrast are verified in
  Playwright regardless, because jsdom does not compute layout or paint.
- G2 (axe): gate on `ADR 0009`. axe-core / `@axe-core/playwright` are MPL-2.0 (file-level copyleft).
  As an unmodified, dev-only, non-distributed test dependency this is normally acceptable, but the
  rule in `ADR 0009` requires explicit owner sign-off before adoption. If declined, fall back to
  hand-written role/contrast/focus assertions (Option B of the a11y row) with no new dependency.
- G3 (visual): default to Playwright `toHavescreenshot`. Baselines are the committed
  `docs/design/mockups/*.png` reduced to the app viewport, or fresh app-rendered baselines — see the
  fidelity phase for why the mockup PNGs are a target, not a byte-exact oracle.
- G4 (lint): replace the `tsc` alias with real ESLint (`typescript-eslint` +
  `eslint-plugin-jsx-a11y` + `eslint-plugin-react-hooks`), all MIT/BSD — clears `ADR 0009` by default.

Every added test/CI dependency passes through `ADR 0009`: prefer MIT / Apache-2.0 / BSD / ISC; flag
any MPL/LGPL/GPL/AGPL for owner review before it enters `devDependencies`; never vendor Gridfinity
Layout Tool source, styling, or assets into fixtures.

## Data And Interface Contracts

Shared test surfaces so layers stay decoupled from concrete component internals.

Fixture shape reused by domain, schema, geometry, and journey tests (one board = one source of
truth), aligned to the MVP plan's Canonical MVP Model:

```ts
// tests/fixtures/boards/rect-2holes-1keepout.json
interface BoardFixture {
  schemaVersion: number;                 // migration harness pins this
  units: "mm";
  calibration: { p0: Px; p1: Px; measuredMm: number; status: CalibrationStatus };
  board: { outlineMm: PolygonMm; thicknessMm: number };
  holes: Array<{ centerMm: PointMm; diameterMm: number; state: FeatureState }>;
  keepouts: Array<{ shape: ShapeMm; side: "top" | "bottom"; clearanceMm: number }>;
  mount: { strategyId: string; standoffMm: number; baseMm: number; tolMm: number };
  expected: GeometryExpectations;        // consumed by generated-geometry tests
}
type FeatureState = "unknown" | "inferred" | "measured" | "confirmed";
type CalibrationStatus = "uncalibrated" | "measured" | "invalid";
```

Generated-geometry oracle (kept in the fixture so the geometry layer has no bespoke expected values):

```ts
interface GeometryExpectations {
  boundingBoxMm: [number, number, number];    // within tolerance
  bodyCount: number;
  holeDiametersMm: number[];                   // sorted
  standoffCentersMm: PointMm[];
  minWallMm: number;                           // must respect requested base/wall
  toleranceMm: number;                         // assertion band, never 0 by default
}
```

Accessibility assertion contract (stable selectors so a11y tests do not couple to styling):

```ts
// Landmarks/regions carry data-testid + ARIA role; focus order asserted against this array.
const FOCUS_ORDER = [
  "topbar", "rail", "canvas-tools", "canvas", "inspector", "validation",
] as const;

interface LiveRegionContract {
  validationCounts: "polite";   // aria-live=polite; announces error/warn/info deltas
  autosave: "polite";           // "Saved" / "Saving…" boundary
  exportProgress: "polite";     // stage name changes ("Generating", "Writing STEP")
}
```

## Phased Implementation Steps

Ordering follows the MVP plan's PR sequence: each product PR lands with the test rung its exit
evidence names, rather than a test-everything-at-the-end phase.

1. **Lint + typecheck gate (real).** Add ESLint flat config with `typescript-eslint`,
   `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks`; repoint `lint` at `eslint .` and add
   `typecheck` as its own step (stop overloading `lint` with `tsc`). Exit evidence (host-level):
   `pnpm run lint && pnpm run typecheck` pass on a clean checkout in CI.
2. **Domain unit suite (vitest).** Cover units mm/px round-trip, calibration transform (pixels →
   mm within tolerance; invalid distance rejected; missing scale blocks), unknown-vs-zero, and
   validation severity error/warn/info. Maps to MVP Test Matrix rows Domain + Calibration. Exit
   evidence (host-level): `pnpm test` green; a deliberately-zeroed unknown field fails a test.
3. **Schema + migration suite.** Load/save `BoardFixture`, a v1→vN migration fixture, and
   round-trip identity. Maps to Test Matrix row Schema and `ADR 0007`. Exit evidence (host-level):
   fixture reopens byte-stable and a stale-version fixture migrates without silent field loss.
4. **Playwright smoke.** Boot the built `preview` server (already wired in `playwright.config.ts`),
   assert the shell renders the library and Board Mount Designer with no console errors. Exit
   evidence (browser-level): one passing spec in `tests/e2e/smoke.spec.ts`.
5. **Full keyboard journey.** Drive `reference → calibrate → outline → holes → keep-outs → mount →
   export` using keyboard only (`Tab`, arrows, `Enter`), no pointer. Assert `FOCUS_ORDER`, arrow-key
   canvas-mark nudge, and that Export unblocks only after validation clears. Maps to COMPONENT_SPEC
   Fidelity Checklist item 8. Exit evidence (browser-level): journey spec passes headless in CI.
6. **Accessibility conformance suite.** Per Accessibility Plan below: axe scan (if G2 passes), 3px
   focus-ring visibility, live-region announcements, non-color-only state, hit-target ≥26px,
   contrast triples. Exit evidence (browser-level): a11y spec passes; a seeded contrast regression
   (edit a token) fails it.
7. **Visual fidelity diff.** Playwright `toHaveScreenshot` at 1440x900 in light and dark against the
   nine mockup states, threshold-bounded. Exit evidence (browser-level): screenshots within
   threshold; dark-theme run driven by `data-theme="dark"`.
8. **Generated-geometry dimension tests (gated on `ADR 0005`).** Once the kernel/adapter lands,
   assert `GeometryExpectations` from the fixture: bounding box, body count, hole diameters, standoff
   centers, min wall, keep-out avoidance, and determinism (same input → identical output hash). Exit
   evidence (generated-geometry-level): dimensions match within named tolerance; a keep-out
   collision is caught.
9. **Export + Fusion gate (gated on `ADR 0006`).** Assert STEP is produced with metadata, readiness
   blockers block, and preview/export derive from the same geometry path. Manual Fusion import
   evidence recorded in `evidence/fusion-import/`. Exit evidence (printed-part-level pathway): STEP
   imports into Fusion with correct units and dimensions per `ADR 0006`.
10. **CI workflow + SessionStart hook.** GitHub Actions runs typecheck → lint → unit → build →
    Playwright on push/PR; `.claude/hooks/session-start.sh` installs deps so web sessions can run the
    same checks. Exit evidence (host-level + browser-level): a red PR blocks; a web session runs
    `pnpm test` and `pnpm test:e2e` without manual setup.

## Continuous Integration Wiring

Single workflow, ordered cheapest-first so fast failures come first:

```yaml
# .github/workflows/ci.yml (proposed)
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # pnpm@10.33.0 per packageManager
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint
      - run: pnpm test                      # vitest run (host-level)
      - run: pnpm run build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm run test:e2e              # browser-level; webServer builds+previews
```

`playwright.config.ts` already sets `forbidOnly`/`retries: 1` under `CI` and discovers a
pre-installed Chromium, so the same specs run in CI and in a web session. The Fusion gate (step 9)
is manual and stays out of CI — it records evidence files, not an automated pass.

### SessionStart hook for web sessions

Per the `session-start-hook` skill, add `.claude/hooks/session-start.sh` registered under
`hooks.SessionStart` in `.claude/settings.json`, so Claude Code on the web can run the suite:

```bash
#!/bin/bash
set -euo pipefail
# synchronous first (guarantees deps before the agent runs checks); switch to async later if slow
[ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && exit 0
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # honors PLAYWRIGHT_BROWSERS_PATH if pre-provisioned
```

Idempotent and non-interactive. Start synchronous (no race where a check runs before install
finishes); move to `{"async": true}` only if startup latency warrants it.

## Accessibility Conformance Plan

Derived from the COMPONENT_SPEC Accessibility Requirements and Interaction Contracts. Each item is a
testable assertion, not a promise:

- **Focus order** top bar → rail → canvas tools → canvas → inspector → validation. Assertion: tab
  through the app and compare the focused `data-testid` sequence to `FOCUS_ORDER`.
- **Visible focus ring**: every interactive element shows a 3px accent ring (tokens: light
  `rgba(79,70,229,.14)`, dark `rgba(109,104,240,.25)`). Assertion: focus each control, read computed
  `box-shadow`/`outline`, fail if none.
- **Keyboard-reachable canvas marks**: marks are focusable and arrow keys nudge by the snap
  increment (`Shift`×10). Assertion in the journey spec: focus a hole, arrow-nudge, read the
  inspector coordinate delta.
- **Live regions**: validation counts, autosave, and export progress announce politely
  (`aria-live="polite"`) per `LiveRegionContract`. Assertion: mutate state, assert the live node's
  text updated; never `assertive`.
- **WCAG AA contrast incl. state triples**: body/secondary text ≥4.5:1 on its panel, and each state
  triple `(fg, bg)` ≥4.5:1, in both themes. Assertion: a token-contrast unit test parses
  `src/styles/tokens.css`, computes WCAG 2 ratios for every pair in the COMPONENT_SPEC state table
  (ok/warn/error/info/measured/uncalibrated/generated), and fails below threshold. This is
  host-level (no DOM) and catches token edits.
- **Non-color-only state**: every state chip pairs color with an icon and a text label. Assertion:
  each `StateChip` exposes an accessible name and a non-color glyph.
- **Hit targets ≥26px**: minimum 26×26 CSS (zoom buttons), 28–30 preferred; rows fully clickable.
  Assertion: measure bounding boxes of interactive controls in Playwright, fail below 26px.
- **Pointer-free operability + reduced motion**: all canvas interactions have inspector equivalents
  (type coordinates, select from object lists), covered by the keyboard journey completing without a
  pointer; and under emulated `prefers-reduced-motion: reduce` the journey still passes with no
  animation-only information.

## Visual Fidelity Checks

Screenshot-diff the app against the nine states in `docs/design/mockups` at 1440x900 in light and
dark, using Playwright `toHaveScreenshot` with a bounded pixel threshold. Honesty constraints:

- The committed `mockups/*.png` are rendered from `mockups/src/*.html` + `mockup.css` (the owner-
  approved reference per `ADR 0011`), not from the app. They are a fidelity **target**, so the first
  baselines are app-rendered screenshots reviewed against the mockups by eye; the diff then guards
  against regression from that reviewed baseline. A byte-exact mockup-vs-app assertion would fail on
  antialiasing and font-hinting noise and is not the gate.
- Dark theme is exercised by setting `data-theme="dark"` (the mechanism the mockups use), covering at
  minimum the three dark reference states: library, editor, and the states/dialog sheet.
- The canvas surface stays dark in both themes (COMPONENT_SPEC theming rule) — the diff must show
  theme switching touching chrome only.

## Failure Modes And Diagnostics

| Failure mode | Symptom | Diagnostic / counter |
|---|---|---|
| Flaky Playwright timing | intermittent journey failures | web-first assertions (`expect(locator)`), no fixed sleeps; `trace: on-first-retry` already set; upload trace on CI failure |
| Screenshot diff noise | fidelity spec fails on font/AA jitter | pin viewport + `deviceScaleFactor`, mask live/tabular-num regions, bounded `maxDiffPixelRatio`; self-host Inter so CI and local fonts match |
| jsdom fakes focus/layout | a11y unit test passes but real app fails | keep focus-ring, hit-target, and focus-order assertions in Playwright, never jsdom |
| Kernel absent | geometry/export specs cannot run | keep them `test.skip` behind an `ADR 0005`/`ADR 0006` capability flag, not deleted, so the gap is visible |
| License-tainted dep slips in | AGPL/unknown-license test dep added | CI license-audit step lists `devDependencies` licenses; fail on non-allowlisted per `ADR 0009` |

## Testing And Evidence

Mapping this plan back to the MVP plan Test Matrix, so a reviewer can check coverage row by row:

| MVP Test Matrix row | This plan's layer | Rung |
|---|---|---|
| Domain | step 2 vitest units | host-level |
| Schema | step 3 migration suite | host-level |
| Calibration | step 2 transform tests | host-level |
| Editor | step 5 journey + step 6 a11y | browser-level |
| Geometry | step 8 (gated `ADR 0005`) | generated-geometry-level |
| Preview | step 4/5 non-empty render | browser-level |
| Export | step 9 (gated `ADR 0006`) | browser-level |
| Fusion gate | step 9 manual evidence | printed-part-level pathway |
| Persistence | step 3 reopen + regenerate | host-level |

Evidence discipline: a green CI run is browser/host-level evidence and nothing more. Geometry
correctness needs generated-geometry-level checks; Fusion import and physical fit need the named
downstream evidence recorded in `evidence/`. No test in this plan upgrades a value from inferred to
measured — only user calibration/entry does, and the journey test asserts that boundary holds.

## Open Decisions

- License clearance for test/CI dependencies — especially axe-core (MPL-2.0) — owned by `ADR 0009`.
  Adopt the allowlist and the CI license-audit step there before dependencies land.
- Component harness split (Testing Library + jsdom vs Playwright-only) — resolve at gate G1; record
  the outcome where the schema/model work lands (`ADR 0004`).
- Geometry dimension oracle and tolerances — cannot be finalized until `ADR 0005` selects a kernel;
  the `GeometryExpectations` shape is proposed, its numbers are not.
- Export/round-trip assertions — owned by `ADR 0006`; the Fusion gate stays manual until then.
- Contrast model (WCAG 2 vs APCA) — WCAG 2 4.5:1 proposed as the gate; no ratified alternative.

## Risks And Counters

| Risk | Counter |
|---|---|
| Tests are written but never gate merges | CI required check on push/PR (step 10); a red run blocks |
| Web sessions can't reproduce CI | SessionStart hook installs identical deps + Chromium; same specs run both places |
| Fidelity diff becomes a rubber stamp or a nuisance | app-rendered reviewed baselines + bounded threshold + masked live regions, not mockup-exact |
| a11y treated as automated-only | axe covers a slice; focus order, ring, live regions, hit targets, contrast triples are explicit hand-written assertions |
| AGPL/unknown-license helper added under deadline | license-audit CI step + `ADR 0009` allowlist reject it before it distributes |
| Preview and export silently diverge | a shared-geometry-path assertion (step 8/9) fails if they don't derive from one model |
