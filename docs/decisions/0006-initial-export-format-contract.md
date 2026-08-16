---
title: ADR 0006 Initial Export Format Contract
tier: decision
adr: 0006
status: proposed
date: 2026-08-16
updated: 2026-08-16
audited: 2026-08-16
related:
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
---

# ADR 0006 - Initial Export Format Contract

## Status

Proposed. Experiment required.

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

| Evidence | Allowed Claim |
|---|---|
| STEP generated but not imported | Export artifact produced for inspection only. |
| STEP imports into Fusion with correct scale and dimensions | STEP export is usable for the named fixture and Fusion version. |
| STL generated from same model | Mesh export is available as secondary/diagnostic output. |
| Printed part checked | Physical fit claim only for the named board, printer/material/profile, and tolerance notes. |

## Blocked Until Evidence Exists

- General STEP compatibility beyond the named downstream tool.
- Parametric editability claims inside Fusion.
- Physical fit claims.
- Treating STL as the MVP success path.

