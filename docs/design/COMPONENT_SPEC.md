---
title: Board Mount Designer Component Spec
tier: platform
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/design/UI_MOCKUPS.md
  - docs/UX_VISION.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0003-local-first-product-posture.md
---

# Board Mount Designer Component Spec

## Status And How To Use This

This is the implementable companion to the [UI mockups](UI_MOCKUPS.md): the complete modular component inventory, design tokens (light **and dark**), layout metrics, canvas mark specifications, interaction contracts, and accessibility rules needed to reproduce those screens exactly.

Together with the mockups, this spec is the **owner-approved guiding UI reference** for implementation ([ADR 0011](../decisions/0011-board-mount-designer-ui-direction.md), 2026-08-16); it remains a living document refined through normal review. Where this spec and a rendered PNG disagree, the mockup sources in [`mockups/src/`](mockups/src/) are the source of truth — every token and metric below is extracted from [`mockups/src/mockup.css`](mockups/src/mockup.css), which doubles as a working reference implementation of the whole system, including the dark theme.

Implementation posture follows [ADR 0003](../decisions/0003-local-first-product-posture.md): React + Vite + TypeScript, Tailwind-compatible styling, Radix/shadcn-compatible component patterns, lucide-style icons. Suggested code mapping is in the last sections.

Recommended reading order for an implementer: Foundations → Layout System → Component Inventory → Canvas Marks → Interaction Contracts → Fidelity Checklist.

## Foundations: Typography

| Role | Font | Notes |
|---|---|---|
| UI text | `"Inter Variable", "Inter", "Segoe UI", system-ui, "DejaVu Sans", sans-serif` | Inter is SIL OFL; load as a self-hosted asset in the product (the mockups use the system-installed copy — no binaries are vendored in this repo). Enable `font-feature-settings: "cv05"`. |
| Numeric values | same family + `font-variant-numeric: tabular-nums` | Applied wherever numbers align or update live: inputs, coordinates, status bar, dimension pills. Class `.num` in the mockups. |
| Code / file names / hashes | `"JetBrains Mono", "SF Mono", "Cascadia Code", "DejaVu Sans Mono", monospace` at 11.5px | Class `.mono`. Also used for error report boxes and silkscreen-style text. |

Type scale (px) and where each step is used. Base body size is **12.5**; the app is information-dense, so steps are tight:

| Size | Weight | Usage |
|---:|---|---|
| 21 | 700 | Library page title ("Projects") |
| 18 | 700 | Sheet/page titles |
| 16.5 | 650 | Empty-state headings |
| 15 | 700 | Section headings (library "Tools") |
| 13 | 650–700 | App name, card titles, dialog titles, format names |
| 12.5 | 400–650 | Body, buttons, inputs, step labels, breadcrumb |
| 12 | 550–650 | Object row names, checklist rows, card body |
| 11.5 | 550–650 | Validation titles, small buttons, canvas hints, tool descriptions |
| 11 | 600–700 | Field labels, badges, canvas pills, meta rows, view switcher |
| 10.5 | 500–700 | Row detail lines, help text, section micro-labels, pane tags |
| 10 | 700 | State chips, kbd |

Weight vocabulary: 400 body, 550 medium, 600 semibold, 650 strong, 700 headings/labels (Inter Variable supports these intermediate weights; with static Inter, round 550→500 and 650→600).

Micro-label style (section headers, pane tags, rail title): 10.5–11px, weight 700, uppercase, letter-spacing 0.06–0.07em, `text-3` color.

## Foundations: Color Tokens

All colors are CSS custom properties on `:root`; dark mode redefines the same names under `:root[data-theme="dark"]`. Components never hardcode themable colors — they reference tokens only. Values below are the exact mockup values.

Neutral / chrome:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#eceef2` | `#101318` | App background |
| `--panel` | `#ffffff` | `#171b22` | Panels, cards, dialogs, bars |
| `--panel-2` | `#f7f8fa` | `#1d222b` | Subtle section bg, dialog footers, file boxes |
| `--panel-3` | `#f1f3f6` | `#232935` | Hover fills, icon tiles, progress track |
| `--border` | `#e3e6eb` | `#2a303c` | Default hairline |
| `--border-strong` | `#ccd3dc` | `#39414f` | Input borders, dashed affordances |
| `--text` | `#16202e` | `#eef1f6` | Primary text |
| `--text-2` | `#46536a` | `#aab4c4` | Secondary text |
| `--text-3` | `#8290a4` | `#7c8798` | Muted text, micro-labels |

Accent (one accent only — indigo; everything else is state-reserved):

| Token | Light | Dark |
|---|---|---|
| `--accent` | `#4f46e5` | `#6d68f0` |
| `--accent-strong` | `#4338ca` | `#5b55e8` |
| `--accent-soft` | `#eef0fe` | `#24284a` |
| `--accent-border` | `#c8cdf9` | `#45499b` |

State colors — each is a triple `(fg, bg, border)` used by chips, validation items, and tinted controls. Hues are identical across themes; only lightness flips:

| State | Light fg / bg / border | Dark fg / bg / border |
|---|---|---|
| ok / Confirmed | `#0f7b4b` `#e7f7ef` `#b5e3cc` | `#53d08a` `#132a1d` `#1f4630` |
| warn / Inferred | `#b45309` `#fdf5e7` `#f0dcb4` | `#f0b13e` `#2b220e` `#4d3c17` |
| error / Missing | `#d92d20` `#fdecea` `#f5c1bb` | `#f4695f` `#2b1512` `#55231e` |
| info | `#47607d` `#f0f4f9` `#d4dfec` | `#9db7d4` `#17202b` `#29384a` |
| Measured | `#1d63d8` `#e9f2fe` `#bcd7fa` | `#6aa6f8` `#12213a` `#234170` |
| Uncalibrated | `#5b6b80` `#eff2f6` `#d3dae3` | `#97a4b5` `#1d232d` `#333c49` |
| Generated | `#7c3aed` `#f4edfe` `#ddc8fa` | `#a78bfa` `#221a38` `#3d2f63` |

Shadows:

| Token | Light | Dark |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.05)` | `0 1px 2px rgba(0,0,0,.4), 0 1px 3px rgba(0,0,0,.3)` |
| `--shadow-2` | `0 4px 10px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.06)` | `0 4px 10px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.35)` |
| `--shadow-pop` | `0 14px 34px rgba(8,13,21,.44), 0 2px 8px rgba(8,13,21,.3)` | `0 14px 34px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.45)` |

Focus/selection rings: light `rgba(79,70,229,.14)`, dark `rgba(109,104,240,.25)` at 3px spread; invalid ring light `rgba(217,45,32,.09)`, dark `rgba(244,105,96,.14)`.

## Foundations: Canvas Surface Palette (Theme-Invariant)

The editing canvas is a dark instrument surface in **both** themes — only the chrome flips. These values never change with theme:

| Element | Values |
|---|---|
| 2D canvas | bg `#171c24` (`--canvas`), dot grid `rgba(255,255,255,.045)` 1px dots on a 24px square grid |
| 3D canvas | bg `#10151c` (`--canvas-2`) + radial glow `rgba(64,105,148,.14–.16)` centered ~50%/56% |
| Floating tool palette | bg `rgba(24,30,39,.92)`, border `#2c3542`, icon `#97a4b5`, hover fill `#232b36`, active = `--accent` + white |
| Status bar | bg `#12161d`, top border `#262e3a`, text `#8b98ab`, values `#c6d0dc`, muted values `#5c6a7d` |
| Canvas pills | bg `rgba(20,25,33,.94)`, border `#303a48`, text `#cdd6e2`, bold `#fff` |
| Canvas hint bar | same family; `kbd` chips `#2a3340` bg, `#3b4656` border, `#dbe3ee` text |
| Uncalibrated banner | bg `#3d3626`, border `#6b5a2e`, text `#f5d78e` |
| Error banner | bg `#43231f`, border `#7a3830`, text `#ffb4a8` |
| Scrim | `rgba(10,14,20,.4)` |

## Foundations: Spacing, Radii, Icons, Motion

- **Spacing scale (px):** 2, 4, 6, 8, 10, 12, 14, 16, 18, 22, 26. Panel padding is 12–14; grids of fields use 8px gaps; card grids 14–22.
- **Radii (px):** 4 (kbd), 6–7 (small buttons, icon buttons, controls), 8 (`--radius`, buttons/inputs/list rows), 9–10 (canvas palettes, banners, fmt cards), 12 (`--radius-lg`, cards/dialogs), 16 (empty-state card), 999 (chips, pills, progress).
- **Borders:** 1px default; 1.5px for input borders, dashed affordances, and radio cards.
- **Icons:** lucide-style inline SVG, `viewBox 0 0 24 24`, `fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap/join: round`. Sizes: 12 (status bar, chips at 10–11 with stroke ≈2.2), 13 (validation, section heads), 14–15 (buttons, tools, banners), 19–20 (tool tiles), 24 (empty state). Chip icons bump stroke-width to ~2.2 for legibility at 10px.
- **Motion (Direction):** 120–160ms ease-out for hover/press and popover fade+4px rise; 200ms for dialog scrim; progress bars animate width linearly. Honor `prefers-reduced-motion: reduce` by disabling non-essential transitions. No motion is load-bearing.

## Theming Rules

1. Themes are token swaps only — components must not branch on theme. Implement as `:root` custom properties overridden by `:root[data-theme="dark"]` (the mockup pages accept `?theme=dark` and set that attribute; see `render.sh`).
2. The canvas, status bar, banners, canvas pills/hints/toolbars, photo overlays, and 3D scene are theme-invariant (always dark). Dialogs and popovers are chrome — they flip.
3. State hues are constant across themes; only lightness/saturation adapt. State is never color-only: every state chip and validation item pairs color with an icon and a text label.
4. A handful of component-level dark overrides exist beyond tokens (input inset shadow, focus/invalid ring alpha, radio-card dot, segmented-on fill) — they are enumerated at the top of `mockup.css` and should be ported as-is.
5. Reference renders: light — all nine mockups; dark — [library](mockups/01-library-dark.png), [editor](mockups/05-outline-holes-dark.png), [dialog sheet](mockups/09-states-dark.png).

## Layout System

Reference frame is 1440×900 (the mockup viewport). All regions are fixed-height/width except the canvas, which flexes:

| Region | Size | Contents |
|---|---|---|
| Top bar | height 50, padding 0 14, gap 12 | logo 26×26 (r7, indigo→violet gradient), app name, breadcrumb, spacer, autosave, undo/redo icon buttons 28×28, units badge, Export button |
| Workflow rail | width 234 | rail title, 8 steps (padding 7 8, radius 7, 20px number bubbles), footer pinned to bottom (back link + note) |
| Canvas | flexes (~900 wide at reference), min 0 | viewport + floating layers |
| Inspector | width 306 | scrollable sections (padding 12 14, hairline dividers) + validation panel pinned at bottom |
| Status bar | height 28 | left: active tool + live readouts; right: state chips, zoom/grid |
| Split view (screen 07) | 2D pane fixed 348, 3D pane flexes | pane tags top-left, view switcher top-right |

Z-layers on the canvas, bottom → top: viewport bg → photo/scene → overlay marks → canvas pills/hints (z≈18) → toolbars/zoom (z≈20) → banners (z≈22) → scrim (z≈24) → popovers/dialogs (z≈26). Top bar sits at z≈30.

Responsive behavior is Direction, not yet designed: below ~1280 the rail may collapse to icons, and the inspector may overlay the canvas; the canvas must always keep priority. Do not let panels shrink type below the scale above.

## Component Inventory: Primitives

| Component | Anatomy & metrics | Variants · states | Seen in |
|---|---|---|---|
| Button | h30, pad 0 12, r8, gap 7, 12.5/600, `--shadow-1`; sm h25 r7 11.5; lg h36 r9 13 | secondary (panel bg, strong border) · primary (accent bg, white) · ghost (borderless, `text-2`) · danger-soft (error triple) · dark-canvas (bg `#232c39`, border `#39455a` — only on canvas surfaces) · disabled = 50% opacity, no shadow | every screen |
| IconButton | 28×28, r7, icon 15, `text-2`; hover `panel-3` | default · disabled (`#c3cad4` light) | top bar |
| Badge | pill, pad 3 9, 11/600, `panel-2` bg, border, `text-2`; optional 11px icon | static label (units "mm", "Local workspace") | top bar, library |
| StateChip | pill, pad 2 7, 10/700, icon 10 @ stroke 2.2, state triple (fg/bg/border) | Uncalibrated · Inferred (≈) · Measured (ruler) · Confirmed (check) · Generated (box) · Exported/neutral · Missing (error triple) | everywhere state appears |
| SegmentedControl | container r8, strong border, `panel-2`; segments pad 6 4, 11.5/600, 1px separators | on-segment: `panel` bg (dark: `panel-3`), accent text, 2px accent inset underline | units mm/inch, side tabs 0/2/4 |
| TextField (Field + Control) | label 11/600 `text-2` + control h28 r7 strong border, pad 0 8, inset shadow; unit suffix 11/600 `text-3`; help 10.5 `text-3` | empty (value `#b3bcc9`) · focus (accent border + focus ring + caret) · invalid (error border, tinted bg, ring; help switches to error color/550) · with-unit · read-only | inspector, dialogs |
| SelectField | TextField + chevron-down 13 `text-3` | same states | capture source, strategy, fastener |
| Checkbox | 15×15 r4, checked = accent bg + white 10px check (stroke 3); label 12 `text-2` | checked · unchecked | export metadata sidecar |
| RadioCard | card r10, 1.5px border, pad 11 12; title 13/700 + ext Badge; desc 11 `text-2`; dot 15 top-right | selected: accent border, `accent-soft` bg, focus-ring glow, filled dot · unselected | export format STEP/STL |
| ProgressBar | track h6 r999 `panel-3`; fill accent r999 | determinate; pair with mono sub-line for stage detail | export in progress |
| Spinner | 24 arc (270°) accent, 15 in dialog tiles | indeterminate | export in progress |
| Kbd | mono 10, `panel-2` bg, strong border with 2px bottom, r4, pad 1 5 | chrome + canvas variants (canvas palette above) | hints |
| Divider | 1px `--border`; vertical 1×22 in top bar | — | throughout |

## Component Inventory: Application Chrome

| Component | Anatomy & metrics | Variants · states | Seen in |
|---|---|---|---|
| TopBar | see layout table | Export button: disabled until generation exists → primary when ready | 02–08 |
| Breadcrumb | 12.5; links `text-2`, separators `border-strong`, current 600 `--text`; may append a neutral chip (tool name) | — | 02–08 |
| SaveStateIndicator | 11.5 `text-3` + 6px green dot `#34a06e` | saved · (saving/conflict are future states — reserve the slot) | top bar |
| WorkflowRail | width 234; title micro-label; steps column gap 1 | — | 02–08 |
| WorkflowStep | row pad 7 8 r7; bubble 20 (1.5px border, 10.5/700) + label 12.5/550 + optional right meta 10.5 or flag icon 13 | todo (muted bubble) · current (`accent-soft` row, accent bubble, 650 label) · done (ok-tinted bubble with 12px check) · error flag (error icon) · warn flag (amber triangle) | 02–08 |
| RailFooter | pinned bottom, top hairline, pad 10 12; ghost back-button + 11px note `text-3` 1.45lh | note text is contextual per step | 02–08 |
| InspectorPanel | width 306, left hairline; scrollable section stack + pinned ValidationPanel | — | 02–08 |
| InspectorSection | pad 12 14, bottom hairline; header: icon 13 `text-3` + micro-label title + optional right chip/action; body = field grid (2-col, gap 8) or ObjectRows | collapsible (chevron) is implied, not shown expanded/collapsed | 02–08 |
| ObjectRow | row pad 7 8 r8; icon tile 22×22 r6 `panel-3` + name 12/600 + detail 10.5 `text-3` tabular + right StateChip | hover `panel-2` · selected (`accent-soft` bg + accent border) · error detail fragment in error color/650 | holes, keep-outs, calibration, reference |
| ValidationPanel | pinned bottom; header row (micro-label + count pills) + item list pad 6 8 8 | counts: error/warn/info pills 10.5/700 with 10px icons; "Clear" ok pill when empty | 02–08 |
| ValidationItem | row r8 tinted bg (state triple), pad 7 8; icon 13 + title 11.5/650 (state fg) + body 10.5 `text-2` 1.45lh + optional right Fix link 10.5/650 accent | error · warning · info; Fix label names the unblocking input ("Enter ⌀", "Calibrate") | 02–08 |
| StatusBar | h28; groups gap 14, 11px; 1×14 separators; values 600 tabular | px-only vs calibrated readouts; muted "— calibrate to see"; right side carries StateChips (Calibrated / Generated), zoom/grid | 02–08 |

## Component Inventory: Canvas

| Component | Anatomy & metrics | Variants · states | Seen in |
|---|---|---|---|
| CanvasViewport2D | dark surface + dot grid; hosts photo + overlay SVG in one transformed coordinate space | photo may be rotated (reference is a photo, not aligned geometry) | 03–06 |
| CanvasViewport3D | `canvas-2` + glow; hosts derived scene | never editable directly — derived only | 07, 08 |
| CanvasToolbar | floating left 12/12; vertical, pad 5, r10, canvas palette; buttons 30×30 r7 icon 15; 1px separators | tool active = accent bg/white; unavailable = 40% opacity | 02–06 |
| ToolButton set | select, pan, calibrate (ruler), outline (polygon), hole (circle-dot), keep-out (dashed rect) | availability follows workflow progress | 02–06 |
| ZoomControl | bottom-right pill cluster: −, value 11/600, +, fit; buttons 26×26 r6 | — | 02–06 |
| ViewSwitcher | top-right, canvas palette, segments pad 4 10 11/650 r6 | Iso/Top/Front/Fit; active = accent | 07 |
| PaneTag | top-left micro-label on canvas (`#7f8da1`) with 12px icon | "2D reference" · "3D preview · derived from canonical model" | 07 |
| CanvasBanner | top-center floating, r9, pad 8 12, 12/550, icon 14, heavy shadow | uncalibrated (amber family) · error (red family); optional inline action chip `rgba(255,255,255,.12)` | 03, 04 |
| CanvasPill | floating pill, pad 4 10, 11/550, icon 12; bold segments white | info · warning tint (`#332809cc` bg, `#8f6d24` border, `#f5d78e` text) · may embed a StateChip | 05–08 |
| CanvasHint | bottom-center, r8, pad 6 12, 11.5, embeds canvas Kbd chips | tool-contextual shortcuts | 05, 06 |
| EmptyStateCard (DropZone) | centered 460w, r16, `rgba(23,29,38,.86)` + inset dashed outline (`#4a5768`, −10px offset), pad 38 40 32; icon tile 52 r14 gradient; title 16.5/650 `#f2f5f9`; body 12.5 `#9aa7b8`; buttons row; formats hint 11 `#78859a`; bottom hairline `#2b3442` + info note | drag-over/rejected are future variants | 02 |
| SplitView | 2D pane 348 + hairline `#262e3a` + 3D pane | selection synced both ways (pills announce it) | 07 |

## Canvas Overlay Marks

Overlay marks live in the same SVG coordinate space as the reference image (mockup photo space: 1000×660 with the board at 75,50–925,610; stroke widths below are in that space — divide by ~1.43 for on-screen px at the mockup's 700px render). All values theme-invariant.

| Mark | Spec |
|---|---|
| Outline path | stroke `#20d3e8` w3.5; subdued context variant w2.5 @ 55% opacity |
| Vertex handle | 18×18 r3 white fill, `#0b7f90` 2.5 stroke |
| Midpoint handle | 7r circle, `#0f2b30` fill, `#20d3e8` 2 stroke |
| Hole marker — Confirmed | ring r26 + 4-way crosshair ticks, `#3ddc97` w3 |
| Hole marker — Measured | same geometry, `#5aa4f8` |
| Hole marker — Inferred | ring dashed 7 5, `#f0b13e` w3 |
| Hole marker — selected | ring r30 w4 `#8b93f8` + outer dashed halo r40 w2 (6 5) + extended ticks |
| Keep-out zone | fill `rgba(244,105,96,.13)` + 45° hatch (13px period, `#f4695f` w3.5 @ 40%) + dashed border w3 (9 6); selected: `#fb8f76`, denser hatch, solid border + white corner handles (17×17 r3, `#a4382a` stroke) |
| Calibration line | `#fbbf24` w3.5 + endpoint crosshair ticks + rings r13 + center dots r3.5; anchor badges 30×30 r8 amber with 20/650 dark letters (A, B); invalid variant swaps amber → `#f4695f` |
| Conflict ring | r34 w4 `#fbbf24` around the affected feature |
| Overlay label pill | rect r16 h32, 16.5–17/650 text; state-tinted dark pills: confirmed `#0d2a1e`/`#2c8e63`/`#7ce7b6` · measured `#0e2136`/`#31639f`/`#9cc5fb` · missing `#211122`/`#a13d63`/`#ff9db4` · inferred/warn `#2b2210`/`#8f6d24`/`#f5d78e` · neutral `#151a22`/`#3a4453`/`#fbd88a` (px length) |

3D preview palette (illustrative until a real kernel/preview exists): bracket top `#2ba5b8`, front face `#1d7f90`, side face `#155f6d`, top-edge highlight `#71d6e4`; standoff top `#43bfd1` + rim `#8ce0ec`, side gradient `#1a7382→#2ea4b7→#135663`, insert bore `#0b3944`; ghost board `#4fd695` dashed (5 4) over `rgba(52,211,153,.10–.16)` fills; keep-out volumes `#f4695f` dashed over `rgba(244,105,96,.10–.16)`; hole axes `#7fb3f2` dashed (2.5 3.5); floor grid `#232c39` @ 10mm; axis triad X `#e05b5b` Y `#57b871` Z `#5b8fe0`.

## Component Inventory: Dialogs And Overlays

| Component | Anatomy & metrics | Variants · states | Seen in |
|---|---|---|---|
| Popover / Dialog | `--panel`, r12, `--shadow-pop`, hairline border; head pad 11 14 (icon + 12.5/650 title + right chip), body pad 12 14, foot pad 10 14 `panel-2` with actions right | popover (anchored, 320–330w) · modal dialog (centered over Scrim, 560w) | 03, 04, 08, 09 |
| Scrim | `rgba(10,14,20,.4)` full-canvas | — | 08 |
| ReadinessRow | 13px ok check + 12 `text-2` text, 3px vertical rhythm | all-green list gates the primary action | 08 |
| FileBox | row r8 `panel-2` + border, pad 8 10; file icon + mono name + right meta/chip | found · Not found (Missing chip) | 09 |
| ErrorReportBox | mono 10.5/1.6, r8 pad 9 11, bg `#131720`, text `#ffb4a8` (both themes) | diagnosable code + feature + parameters — never a bare "failed" | 09 |
| MetaGrid | 2-col dl: dt 11 `text-3` / dd 11/600, gaps 3 14 | export metadata, inferred-value review | 08, 09 |
| BlockerRow | error-tinted r8 row: icon 12 + title 11.5/650 error + body 10.5 + right Fix link | blocks the footer action while present | 09 |

## Component Inventory: Library Screens

| Component | Anatomy & metrics | Variants · states | Seen in |
|---|---|---|---|
| PageHeader | title 21/700 −0.02em + sub 12 `text-3` (mono path fragment) + right action cluster | — | 01 |
| ProjectCard | card r12 `--shadow-1`; thumb 118h (dark gradient `#1a2029→#141922`, bottom hairline); body pad 11 13: name 13/650, tool line 11/600 accent, meta 11 `text-3`, chip row gap 5 | chips mix neutral (In progress, Draft) with StateChips (Calibrated, Generated, Uncalibrated) | 01 |
| ProjectThumb | mini schematic: outline `#3fd0e4` w1.8, holes `#8b93f8`, keep-outs dashed `#f4695f`; draft = dashed outline, gray holes | one per project, abstract (not the photo) | 01 |
| NewProjectCard | dashed 1.5 `border-strong` r12, centered: 34px plus-bubble (panel, shadow), 12.5/650 title, 11 `text-3` sub | — | 01 |
| ToolCard | card pad 15, icon tile 40 r10 + name 13/650 + chip + desc 11.5 `text-2` 1.5lh + action | active (accent-soft tile, "Available" ok chip, primary CTA) · muted @ 66% ("Planned — future scope", disabled CTA) · ghost (dashed, centered aphorism) | 01 |
| LocalFirstStrip | info-tinted row r10 pad 10 14, lock icon, 12px text with bold lead | reinforces no-account posture | 01 |

## Interaction Contracts

These bind the [UX Vision interaction principles](../UX_VISION.md) to components:

- **Focus**: every interactive element shows a visible 3px accent focus ring (tokens above). Focus order: top bar → rail → canvas tools → canvas → inspector → validation. Canvas marks are keyboard-reachable (arrow keys nudge by snap increment; Shift×10).
- **Exactness**: any value placed visually is immediately editable as a number (`Enter` opens typed editing — the status-bar hints advertise this). Snapping never rounds the stored value silently; it sets it visibly.
- **Disabled semantics**: a disabled primary action always has an adjacent explanation of what unblocks it (ValidationItem Fix links, "Confirm becomes available once required values exist", blocker rows in the export dialog). Never a bare disabled button.
- **Validation**: every error/warning states what is wrong, why it matters, and which input fixes it, with the Fix link focusing that input. Errors block generation/export; warnings don't block but persist; info never nags.
- **State transitions**: Uncalibrated → Measured happens only via calibration; Inferred → Confirmed via explicit review (screen 09 card 6); typing a measured value upgrades Inferred → Measured. Rejected inputs (screen 04) never overwrite prior state.
- **Long operations**: generation/export over ~300ms shows determinate progress with a named stage and a Cancel that leaves the last good result untouched.
- **Undo/redo**: top-bar buttons reflect the transaction stack; each placed/edited mark is one transaction. Autosave indicator updates on the save boundary.
- **Escape hatches**: Cancel/Close on every popover; Esc closes; destructive actions are ghost-styled, never primary.

## Accessibility Requirements

- Text contrast: body/secondary text meets WCAG AA against its panel in both themes (`text-3` is reserved for non-essential meta; do not set essential values in `text-3`). Verify the state-triple fg-on-bg pairs stay ≥ 4.5:1 when porting.
- State is never conveyed by color alone — icon + label chips everywhere (already specified).
- Hit targets: minimum 26×26 css (zoom buttons) with 28–30 preferred; rows are fully clickable, not just their text.
- All canvas interactions have inspector equivalents — the app is fully operable without the pointer (type coordinates, select from object lists).
- Units are always visible adjacent to values; px vs mm is never ambiguous (status bar shows both, mm withheld until calibrated).
- Live regions: validation counts and the autosave indicator announce changes politely; progress announces stage changes.
- Respect `prefers-reduced-motion`; no information is animation-only.

## State Vocabulary Binding

| Chip | Meaning (canonical: UX Vision) | Icon | Token triple |
|---|---|---|---|
| Uncalibrated | reference has no trustworthy scale | crosshair | uncal |
| Inferred | suggested by geometry/defaults/heuristics; editable, not measured | ≈ wave | inferred (= warn) |
| Measured | entered from a known measurement source | ruler | measured |
| Confirmed | reviewed and accepted by the user | check | ok |
| Generated | derived from canonical project data | box | generated |
| Exported | written to an output format with metadata | (neutral chip) | neutral |
| Physically verified | never shown as achieved in mocks | — | reserved |
| Missing | required value absent (unknown ≠ zero) | — | error |

## Implementation Mapping

Suggested React composition (names mirror this spec; placement follows the [MVP plan repository shape](../plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md)):

```text
src/app/shell/            TopBar, Breadcrumb, SaveStateIndicator, ThemeProvider
src/app/library/          PageHeader, ProjectCard, ProjectThumb, NewProjectCard, ToolCard, LocalFirstStrip
src/components/ui/        Button, IconButton, Badge, StateChip, SegmentedControl, TextField, SelectField,
                          Checkbox, RadioCard, ProgressBar, Spinner, Kbd, Dialog, Popover, FileBox,
                          ErrorReportBox, MetaGrid, ValidationItem
src/tools/board-mount-designer/
  workflow/               WorkflowRail, WorkflowStep, RailFooter
  editor2d/               CanvasViewport2D, CanvasToolbar, ZoomControl, CanvasBanner, CanvasPill,
                          CanvasHint, EmptyStateCard, overlay marks (OutlinePath, HoleMarker,
                          KeepoutZone, CalibrationLine, ConflictRing, OverlayLabelPill, handles)
  preview/                CanvasViewport3D, ViewSwitcher, PaneTag, SplitView
  inspector/              InspectorPanel, InspectorSection, ObjectRow, ValidationPanel, StatusBar
```

Radix/shadcn primitive mapping: Dialog/Popover → Radix Dialog/Popover; SelectField → Radix Select; Checkbox → Radix Checkbox; RadioCard → Radix RadioGroup; SegmentedControl/ViewSwitcher → Radix ToggleGroup; Tooltip (future) → Radix Tooltip. Keep shadcn-style `class-variance-authority` variants matching the variant columns above.

Tailwind wiring: expose every token as a CSS variable exactly as in `mockup.css`, then map them in the theme (`colors: { panel: "var(--panel)", ... }`) so `data-theme="dark"` flips the app with zero component changes. Non-token canvas constants can live in a `canvas.ts` constants module shared by the 2D overlay renderer and the 3D scene.

Overlay marks should render in image/board coordinate space under a single zoom/pan (and optional photo-rotation) transform, with label pills counter-rotated to stay horizontal — this matches how the mockups are built (`.photo-rot` wrapper + one `<svg class="overlay">` sharing the photo's viewBox).

## Fidelity Checklist

An implementation matches the mockups when:

1. Side-by-side with each PNG at 1440×900, layout regions match the metrics table (±2px) in both themes.
2. Every component's variants and states in the inventory tables exist and are reachable.
3. All ten required early states from UX Vision are demonstrable, with the exact severity split shown (errors block, warnings persist, info informs).
4. State chips use the binding table's icon + label + triple; nothing conveys state by color alone.
5. The canvas stays dark in light mode; theme switching touches chrome only, via tokens.
6. px readouts appear before calibration; mm appears only after; rejected calibrations leave prior state untouched.
7. Disabled Export is always accompanied by the blocking reasons and working Fix links.
8. Keyboard-only operation can complete the journey: reference → calibrate → outline → holes → keep-outs → mount → export.
9. No feature implies auto-detection, ratified formats/kernel, cloud dependency, or physical fit — the [mockup non-promises](UI_MOCKUPS.md) hold in the implementation.

## What This Spec Does Not Decide

Geometry kernel, export formats, project schema, image/privacy boundary, and license remain owned by their ADRs. Real preview rendering (the 3D palette above is illustrative), responsive breakpoints, camera capture UI, and the final component library extraction (shared with Cadence/Axon only after a real second consumer exists — ADR 0003) are open. The UI direction itself is owner-approved via [ADR 0011](../decisions/0011-board-mount-designer-ui-direction.md); it guides implementation and continues to be refined through review rather than being frozen pixel-for-pixel.
