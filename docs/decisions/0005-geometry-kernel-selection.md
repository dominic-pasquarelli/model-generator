---
title: ADR 0005 Geometry Kernel Selection
tier: decision
adr: 0005
status: accepted
date: 2026-08-16
updated: 2026-08-20
audited: 2026-08-20
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0005 - Geometry Kernel Selection

## Status

Accepted (2026-08-19). A **self-contained TypeScript mesh solid generator** is Built and Verified at host level. The exact-analytic-kernel path (OCCT/replicad) and the Fusion-import evidence gate remain open — see Decision and ADR 0006.

## Decision (2026-08-19)

The **mesh-only path** in the matrix below was promoted from a fallback to the shipped generator and implemented dependency-free in TypeScript (`src/core/geometry/mesh.ts` + `src/core/geometry/solidGenerator.ts`, the active `GeometryAdapter`).

Rationale: the Board Mount Designer geometry family — a prismatic plate, cylindrical standoffs with coaxial bores, and box tabs — is simple enough to generate a **real, watertight, single connected closed-manifold solid deterministically without any WASM kernel**. This clears the browser-viability, determinism, and diagnostics criteria immediately at zero bundle cost, and the same solid feeds the 3D preview and both exporters (the "same shared geometry path" rule).

What it produces and its evidence class:

- A **single connected** closed solid (plate + one bored standoff per hole + optional side tabs, all welded into one vertex pool). The plate top/bottom faces are triangulated with the standoff/bore/keep-out circles as holes, so the whole artifact is one connected manifold rather than a pile of overlapping shells. It passes a **production, fail-closed aggregate manifold audit** (`auditMesh` in `mesh.ts`) that runs BEFORE any preview or export is returned — not just a fixture assertion — verifying: finite coordinates, valid indices, nonzero-area triangles, every undirected edge shared by exactly two oppositely-directed uses (watertight + consistently oriented), exactly one connected component, a single manifold fan at every vertex, and positive signed volume. Because preview and both exporters consume this audited result, none can serialise a solid that failed the audit. (This supersedes the earlier per-body `V − E + F = 2` Euler description: the artifact is one body and correctness is proven by the aggregate audit above, which is strictly stronger — it also proves vertex-manifoldness and positive volume.)
- **Generated-geometry-level** fixture checks pass: the ADR two/four-hole rectangular fixture yields the expected footprint (85 mm + 2×3 mm wall = 91 mm), height (base + standoff), and standoff count.
- **Browser-level**: the Playwright journey renders the generated solid in the live 3D preview.
- Diagnostics: generation returns coded errors (`MISSING_DIAMETER`, `MISSING_MOUNT_HEIGHT`, `UNRESOLVED_MODEL`, …) with the implicated feature, never fabricating geometry from an Unknown value.

What is explicitly **not** decided or earned here:

- An **exact analytic B-rep kernel** (OCCT-WASM / replicad) is deferred. Consequently the STEP export is a **faceted** B-rep (curved standoff walls are facets), owned by ADR 0006.
- **Printed-part fit** is unproven (Phase 9).

Reconsideration trigger: if analytic curved surfaces, true fillets, or parametric CAD editability beyond faceted import are required, revisit the OCCT-WASM path behind the unchanged `GeometryAdapter` seam — the shell depends only on that interface, so the swap does not touch the app.

The original spike framing below is retained for provenance.

## Question

Which geometry kernel can generate deterministic board-mount geometry, support useful validation, and produce the selected export formats without forcing the project model to become kernel-native?

## Candidate Evaluation Criteria

- deterministic generation from semantic inputs;
- exact-solid support where needed;
- mesh output where appropriate;
- browser and/or desktop viability;
- worker/background execution support;
- diagnostics for failed generation;
- license compatibility;
- import/export fidelity evidence;
- testability in host-level fixtures.

## Spike Needed

Generate a simple two-hole board mount from semantic inputs, verify expected dimensions, and export in candidate formats. Record failures as evidence, not just preferences.

## Candidate Matrix For Phase 0

| Candidate Path | Why It Stays In Scope | Must Prove | Failure Mode To Record |
|---|---|---|---|
| Browser/WASM solid kernel with STEP support | Best match for local-first browser posture. | Generate the fixture bracket without blocking the UI and produce a STEP file for the export gate. | Package size, startup cost, unsupported STEP path, weak diagnostics. |
| Worker-backed browser geometry adapter | Keeps generation off the main thread while preserving a web MVP. | Deterministic progress, cancel, and error reporting from the same semantic fixture. | Non-deterministic output, difficult transfer of geometry artifacts, poor error mapping. |
| Electron/local helper around a solid kernel | Preserves the accepted Electron-compatible escape path if browser STEP fails. | Same semantic input produces the same dimensions and export metadata through a local boundary. | Desktop packaging complexity, platform-specific install burden, hidden service dependency. |
| Mesh-only path | Useful as a preview or diagnostic fallback. | Produce dimensionally correct STL or mesh preview for the fixture. | Cannot satisfy the MVP alone because STEP/Fusion import is the CAD gate. |

## Phase 0 Fixture

Use a synthetic, documented rectangular board-mount fixture so the spike is not blocked on real hardware:

- board outline: rectangle in millimeters;
- mounting holes: at least two, preferably four, with explicit diameters and fastener type;
- keep-out: one zone that forces either a warning or a clipped/adjusted generated feature;
- mount: simple plate plus standoffs, screw or insert bores, base thickness, clearance, tolerance;
- expected checks: bounding box, hole center distances, hole diameters, standoff height, base thickness, and warnings.

## Spike Exit Criteria

- Geometry is generated only from the semantic fixture.
- Host-level checks verify dimensions before any preview or export claim.
- Generation failures include affected entity ids and parameters.
- ADR 0006 receives matching export evidence or a documented blocker.

