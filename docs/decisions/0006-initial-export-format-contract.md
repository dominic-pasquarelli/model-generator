---
title: ADR 0006 Initial Export Format Contract
tier: decision
adr: 0006
status: accepted
date: 2026-08-16
updated: 2026-08-19
audited: 2026-08-19
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0006 - Initial Export Format Contract

## Status

Accepted (2026-08-19). **STL and STEP export are Built and Verified host-level.** Both write real geometry from the shared solid path (ADR 0005). The **Fusion import evidence gate remains OPEN** — no `evidence/fusion-import/` record exists yet — so the "usable in Fusion" claim is not earned.

## Decision (2026-08-19)

Two formats ship, both real, both derived from the same generated solid the preview consumes:

- **STL** (`src/core/export/stl.ts`): a genuine ASCII STL — a watertight print mesh of the solid, with per-facet normals. Host-verified: one facet per mesh triangle, deterministic bytes for an unchanged model.
- **STEP** (`src/core/export/step.ts`): a real **faceted** B-rep, ISO-10303-21 **AP214**. One `MANIFOLD_SOLID_BREP` closed shell per body; welded `VERTEX_POINT`s; each edge is a shared `EDGE_CURVE` referenced by its two faces with opposite `ORIENTED_EDGE` sense. Host-verified structurally: well-formed envelope, every `#id` reference resolves, one closed shell per body, one `ADVANCED_FACE` per triangle, and every edge shared by exactly two faces with opposite sense (closed manifold at the entity level).
- **Metadata sidecar** (`*.meta.json`): real, and records schema version, units, generator + kernel provenance, `paramsHash`, generated bounding dimensions, body/triangle counts, warnings, and an explicit `unsupportedClaims` list.

Honesty boundary, unchanged and enforced in the artifact note: the STEP is **faceted** (curved standoff walls are facets, not analytic surfaces), and **Fusion import and printed-part fit are unverified**. The export UI and sidecar state this; nothing claims a validated CAD import.

The claim table below is updated to what evidence exists today.

## Question

Which export formats are supported in the first Board Mount Designer slice, and what claims may the project make about each?

## Proposed Rule

Do not promise an export format until the chosen geometry path can produce it with named evidence. Distinguish printable mesh output from editable CAD output.

## Minimum Metadata

Every export should record project schema version, units, generator version, input parameters, warnings, and known limitations.

## Spike Needed

Test candidate STL/STEP/3MF or other formats against a simple board mount and at least one downstream tool. Record what is editable, printable, lossy, or unsupported.

## Phase 0 Export Gate

STEP is the MVP CAD evidence target from ADR 0010. The Phase 0 spike should treat STEP as the first-class export gate and STL as secondary diagnostic output only.

Minimum gate:

- generate the same fixture bracket used by ADR 0005;
- export STEP with millimeter units and metadata sidecar if embedded metadata is impractical;
- import the STEP into Autodesk Fusion;
- verify expected bounding dimensions, hole positions, hole diameters, standoff height, and body count;
- record the result in `evidence/fusion-import/` before calling the export path usable.

STL may be emitted for preview, slicer diagnostics, or print follow-up, but STL success does not prove CAD import or editability.

## Supported Claims After The Gate

| Evidence | Allowed Claim | Current status (2026-08-19) |
|---|---|---|
| STEP generated (faceted) but not imported | Export artifact produced for inspection only; structurally valid AP214 closed-shell solid. | ✅ Earned (host-level). |
| STEP imports into Fusion with correct scale and dimensions | STEP export is usable for the named fixture and Fusion version. | ❌ Not earned — no `evidence/fusion-import/` record yet. |
| STL generated from same model | Mesh export is available as a real, watertight print mesh. | ✅ Earned (host-level). |
| Printed part checked | Physical fit claim only for the named board, printer/material/profile, and tolerance notes. | ❌ Not earned. |

## Blocked Until Evidence Exists

- General STEP compatibility beyond the named downstream tool.
- Parametric editability claims inside Fusion.
- Physical fit claims.
- Treating STL as the MVP success path.

