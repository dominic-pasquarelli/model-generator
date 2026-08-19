---
title: Project Schema, Persistence and Migration Plan
tier: workflow
status: proposed
updated: 2026-08-19
audited: 2026-08-19
related:
  - docs/PROJECT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/workflows/BOARD_MOUNT_DESIGNER.md
  - docs/plans/BOARD_MOUNT_DESIGNER_MVP_PLAN.md
  - docs/decisions/0007-project-file-schema-and-migration-policy.md
  - docs/decisions/0004-canonical-semantic-document-model.md
---

# Project Schema, Persistence and Migration Plan

> **Status update (2026-08-19):** Portable **`.mgproj` save/open is Built** (ADR 0007 Accepted): `downloadProjectFile` / `importProjectFile` in the store, on the existing versioned schema, forward-migration harness, and runtime shape validation. Import is additive (fresh id on collision) and corrupt files fail with a diagnosable `MgFileError`; unknown/missing `Val<T>` values round-trip. The one open refinement is asset packaging — reference images currently embed as data-URL `src` inside the JSON, which a future zipped-container revision may externalise (schema and migration policy unchanged).

## Purpose & Scope

This plan hardens the in-memory shell model (currently a zustand store with a `localStorage`
draft) into a real, versioned, on-disk project format with tested migrations. It owns the durable
representation of project truth for Board Mount Designer and the reusable board-definition library.

In scope: the versioned JSON schema for the MVP entities (`Project`, `ReferenceImage`,
`Calibration`, `Board`, `MountingHole`, `KeepOut`, `MountStrategy`, `GeneratedModel`); the
`ValueState<T>` wrapper distinguishing absent / unknown / inferred / measured / confirmed and how it
serializes; the `.mgproj` container and reference-image asset storage; a forward-only numbered
migration framework with a `v1` fixture and round-trip tests; autosave / recovery boundaries;
corrupt-file and missing-asset handling; and the reusable board library. Maps to MVP plan Phase 2 and
Phase 8.

Out of scope / not ratified here: geometry kernel (`ADR 0005`), export formats (`ADR 0006`), the
image/privacy boundary (`ADR 0008`), and the license (`ADR 0009`). This document proposes candidates
and decision gates only. Ratification of the schema and packaging returns to `ADR 0007`; ratification
of the canonical-model posture returns to `ADR 0004`. Status is proposed; nothing below is Built.

## Where It Fits (architecture seam)

Per `docs/ARCHITECTURE.md`, this is the "Persistence/migration" and "Project/document model" rows.
The persistence module sits below the tool and above the browser storage APIs:

```text
tools/board-mount-designer (editor state, zustand)
        │  serialize()/hydrate()  (pure, no I/O)
core/project/              ← schema types, ValueState, ids, provenance
core/project/migrations/   ← numbered forward-only migrators
core/project/persistence/  ← .mgproj container read/write, asset store, autosave, recovery
        │
File System Access API · IndexedDB · localStorage
```

Hard rule: the serializer is a pure function of the canonical model; geometry, preview scene, and
exports are derived artifacts that are never the durable source of truth (`ADR 0004`). The persistence
layer must not import kernel handles or DOM nodes. Units are owned by `core/units`; persistence stores
declared units and coordinate frames but never redefines them.

## Candidate Approaches

Three axes need decisions: (A) container packaging, (B) image-asset storage, (C) migration style.

### Container packaging candidates

| Option | Shape | Pros | Cons | Gate |
|---|---|---|---|---|
| Single JSON `.mgproj` | one JSON file, asset inline or linked | trivial to diff, email, git; matches ADR 0007 spike | large base64 bloats file; whole-file rewrite on save | must round-trip fixture with stable ids |
| Zip container `.mgproj` (JSZip) | `project.json` + `assets/` + `meta.json` | separates asset bytes from semantic diff; streams | binary, not diffable; adds dep; harder manual repair | must open in a browser with no server |
| Directory bundle (FS Access dir handle) | folder of JSON + assets | git-friendly, partial writes | needs directory-picker support; desktop-leaning | must degrade to single-file in-browser |

Decision gate G1 (owned by `ADR 0007`): pick single-JSON for the MVP spike (readable, diffable,
matches the ADR's stated posture); keep the reader tolerant so a later zip/dir container is an additive
migration of the *container*, not the *schema*.

### Image-asset storage candidates

| Option | Where bytes live | Pros | Cons |
|---|---|---|---|
| Inline base64 in JSON | `referenceImage.asset.dataUri` | one self-contained file; no dangling refs | ~33% size overhead; multi-MB JSON; slow parse |
| Sidecar file | `<name>.assets/<hash>.png` next to `.mgproj` | small JSON; native bytes | two files travel together; missing-asset risk |
| IndexedDB blob | keyed by content hash, referenced by id | fast, no encode cost, survives reload | not portable across machines without export step |

Decision gate G2 (owned by `ADR 0007`, coordinates with `ADR 0008`): default to **IndexedDB blob for
the working copy** (fast autosave, no encode churn) and **inline base64 on explicit export/"Save As"**
so a shared `.mgproj` is self-contained. Store a `sha256` content hash + byte length + MIME either way,
so a missing/hash-mismatched asset is a diagnosable state, not a silent blank canvas. The privacy
implication of embedding a photo in a shareable file is deferred to `ADR 0008`; until then the exporter
warns before inlining.

### Migration style candidates

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| Forward-only ordered functions | `migrate_n_to_n+1(doc)` chain | simple, deterministic, testable; ADR 0007 requirement | no downgrade path (accepted) |
| Bidirectional/JSON-schema-diff | up + down transforms | reversible | doubles surface, unneeded pre-1.0 |
| Runtime validator only (zod) | validate, reject unknown | strong types | rejects unknown-extension fields ADR 0007 wants preserved |

Decision gate G3 (owned by `ADR 0007`): forward-only ordered migrators + a **non-stripping** validator
that preserves unknown extension fields (carry an `x` bag) rather than rejecting them.

## Data / Interface Contracts

### ValueState wrapper

The core primitive that keeps unknown from becoming zero. Five provenance states; the numeric payload
is present only when meaningful.

```ts
type Provenance = 'absent' | 'unknown' | 'inferred' | 'measured' | 'confirmed';
// absent   = field never engaged by the user (may be omitted entirely on write)
// unknown  = user acknowledged the field but has no value (explicitly not zero)
// inferred = suggested by defaults/geometry/heuristics; editable
// measured = entered from a known measurement source
// confirmed= reviewed and accepted by the user

interface ValueState<T> {
  state: Provenance;
  value?: T;                 // MUST be undefined unless state ∈ {inferred,measured,confirmed}
  source?: string;           // e.g. "calibration:line-1", "user", "default:M3"
  updatedAt?: string;        // ISO-8601
  x?: Record<string, unknown>; // unknown-extension bag, preserved across migrations
}
```

Serialization rules (invariants enforced by a `assertValueState` guard and tested):
`state:'absent'` serializes as either an omitted key or `{ "state": "absent" }` — never `value:0`.
`state:'unknown'` serializes with **no `value` key**. A missing `value` on read is coerced to
`undefined`, never `0`. The `x` bag round-trips verbatim. Reading `value` requires going through
`resolve(vs): T | undefined`; no call site reads `vs.value` directly.

### Document schema (v1)

```ts
interface ProjectDocumentV1 {
  schemaVersion: 1;
  kind: 'model-generator/project';
  id: string;                       // stable ULID
  meta: {
    name: string;
    units: 'mm';                    // explicit; px is a canvas-space unit, never persisted as length
    coordinateFrames: { board: 'board-mm'; image: 'image-px' };
    generatorVersion: string;       // app/schema build stamp
    createdAt: string; updatedAt: string;
  };
  referenceImage?: ReferenceImage;
  calibration?: Calibration;
  board?: Board;
  mountingHoles: MountingHole[];
  keepOuts: KeepOut[];
  mountStrategy?: MountStrategy;
  generatedModel?: GeneratedModel;  // metadata only; geometry is derived, not stored
  x?: Record<string, unknown>;
}

interface ReferenceImage {
  id: string; pixelSize: { w: number; h: number };
  assetRef: { kind: 'idb'|'inline'|'sidecar'; key: string; dataUri?: string;
              sha256: string; byteLength: number; mime: string };
  provenance: { addedAt: string; capture?: 'upload'|'camera'; note?: string };
}

interface Calibration {
  id: string; points: [Vec2Px, Vec2Px];     // image-px frame
  knownDistance: ValueState<number>;         // mm; unknown until entered
  transform?: { pxPerMm: number; source: 'two-point-line' }; // derived, revalidated on load
  uncertainty: ValueState<number>;           // mm, optional
}

interface Board {
  id: string; name: string; revision?: string;
  outline: { frame: 'board-mm'; polygon: Vec2[] } | null;  // null ≠ empty polygon
  thickness: ValueState<number>;             // mm
}

interface MountingHole {
  id: string; center: Vec2;                  // board-mm
  diameter: ValueState<number>;
  fastener: ValueState<'M2'|'M2.5'|'M3'|'M4'|'heat-set'|string>;
  provenance: Provenance;
}

interface KeepOut {
  id: string; side: 'top'|'bottom'|'both';
  shape: { kind: 'rect'|'circle'|'polygon'; /* frame board-mm */ };
  clearance: ValueState<number>;            // height or depth mm
  purpose?: string;
}

interface MountStrategy {                   // all dims ValueState<number> (mm)
  id: string; kind: 'plate'|'board-shaped'|'standoff-bridge';
  standoffHeight: ValueState<number>; baseThickness: ValueState<number>;
  bossDiameter: ValueState<number>; tolerance: ValueState<number>;
  sideTabs?: 0 | 2 | 4;
}

interface GeneratedModel {                  // provenance record, not geometry
  sourceSchemaVersion: number;
  parameterHash: string;                    // hash of the canonical inputs used
  warnings: ValidationRef[];
  export?: { format: string; at: string; metadataHash: string };
}
```

### Board-definition library entry

A board saved for reuse across mount strategies is the `Board` subtree plus its calibration and
image-independent facts, stored as a standalone versioned document so it can be imported into a new
project without dragging the whole reference image.

```ts
interface BoardLibraryEntryV1 {
  schemaVersion: 1;
  kind: 'model-generator/board-definition';
  id: string; name: string; revision?: string;
  board: Board;
  mountingHoles: MountingHole[];
  keepOuts: KeepOut[];
  derivedFrom?: { projectId: string; at: string };  // provenance link, not a hard dependency
}
```

### Persistence interface

```ts
interface ProjectStore {
  serialize(model: CanonicalModel): ProjectDocumentV1;      // pure
  hydrate(doc: unknown): Result<CanonicalModel, LoadError>; // validate → migrate → build
  saveFile(doc: ProjectDocumentV1, handle?: FileSystemFileHandle): Promise<void>;
  openFile(): Promise<Result<CanonicalModel, LoadError>>;
  autosave(model: CanonicalModel): Promise<void>;           // IndexedDB, debounced
  recover(): Promise<CanonicalModel | null>;                // latest good autosave
}
type LoadError =
  | { code: 'corrupt-json' } | { code: 'unknown-kind' }
  | { code: 'unsupported-future-version'; found: number; max: number }
  | { code: 'migration-failed'; at: number; cause: string }
  | { code: 'missing-asset'; assetKey: string }
  | { code: 'hash-mismatch'; assetKey: string };
```

## Phased Implementation Steps

1. **Define `ValueState<T>` + guards + `resolve()` in `core/project/value-state.ts`.**
   Include the `absent`/`unknown` invariants and the `x` bag. Exit Evidence (host-level): vitest suite
   proves no `unknown`/`absent` value serializes as `0` and `resolve()` returns `undefined` for both.

2. **Write the `v1` schema types and `assertProjectDocumentV1` non-stripping validator** in
   `core/project/schema.ts`. Exit Evidence (host-level): fixtures for a full board-mount project and a
   deliberately partial project both validate; an unknown extra field survives validation into `x`.

3. **Implement `serialize`/`hydrate` as pure functions** decoupled from the zustand store; wire the
   store's existing `localStorage` draft to call `serialize`. Exit Evidence (host-level): round-trip
   `hydrate(serialize(m))` deep-equals `m` for the fixture, including ids, units, provenance, and
   unknown values.

4. **Build the migration harness** in `core/project/migrations/`: an ordered
   `migrations: Array<{ from: number; to: number; up(doc): doc }>`, a `runMigrations(doc, target)`
   driver, a `v1` fixture, and a legacy `v0` fixture missing one optional field and holding one
   `unknown` value. Exit Evidence (host-level): migrating `v0 → v1` is deterministic, preserves stable
   ids/units/provenance, and does not coerce the `unknown` to `0` (directly satisfies `ADR 0007` Phase 0
   scope).

5. **Implement the `.mgproj` container writer/reader (single-JSON, G1)** with a tolerant reader that
   accepts an omitted asset. Exit Evidence (browser-level): Playwright saves via File System Access API
   (falling back to a Blob download) and reopens the same file with identical canonical model.

6. **Implement the asset store (G2): IndexedDB blob for working copy, inline base64 on export**, keyed
   by `sha256`, with hash verification on load. Exit Evidence (browser-level): a saved project reopened
   after a reload shows the same reference image; a tampered/absent blob yields `missing-asset` /
   `hash-mismatch`, not a blank canvas.

7. **Add autosave + recovery boundaries**: debounced (~2 s idle / on transaction commit) write to an
   IndexedDB `recovery` slot distinct from the user's saved file; on startup offer recovery if the slot
   is newer than the last explicit save. Exit Evidence (browser-level): a simulated crash (reload
   mid-edit) offers and restores the last good state.

8. **Corrupt-file and missing-asset UX**: map each `LoadError` to a diagnosable `ErrorReportBox`
   (never a bare "failed"; per `COMPONENT_SPEC.md`), with a `FileBox` "Not found" state for the asset.
   Exit Evidence (browser-level): opening a truncated `.mgproj` shows `corrupt-json` with the byte
   offset; a future-version file shows `unsupported-future-version` and refuses rather than guessing.

9. **Board-definition library**: `BoardLibraryEntryV1` save/import backed by IndexedDB, with a
   `derivedFrom` provenance link. Exit Evidence (browser-level): one saved board imports into a second
   project and drives a different `MountStrategy` (supports the vision's "reuse of one board definition
   across multiple mount strategies" measure).

10. **Parameter-hash + generated-model provenance**: compute `parameterHash` over the canonical inputs
    so a reopened project can prove it would regenerate the same geometry. Exit Evidence
    (generated-geometry-level): the hash is stable across save/reopen for unchanged inputs and changes
    when a persisted `ValueState.value` changes — feeds the Phase 8 "reopen and regenerate same bracket"
    gate. (Printed-part-level evidence is out of scope here; it lives in MVP Phase 9.)

## Failure Modes & Diagnostics

- **Silent zero coercion** — the class of bug this plan exists to prevent. Countered by the
  `ValueState` guard (no `value` on `absent`/`unknown`) plus a lint-style test that greps serialized
  fixtures for accidental `"value": 0` on non-measured states.
- **Corrupt JSON** — `JSON.parse` wrapped in a Result; report offset and length; never partial-apply.
- **Future schema version** — refuse with `unsupported-future-version`; never run migrations backward
  or drop unknown fields to force a load.
- **Migration non-determinism** — migrators must be pure; forbid `Date.now()`/`Math.random()` inside
  `up()` (timestamps come from the driver). Enforced by a golden-output migration test.
- **Missing / mismatched asset** — hash check on load; degrade to a clearly-labeled "reference missing"
  editor state that still lets numeric editing continue (measurements are the source of truth, not the
  image), never a blank silently-scaled canvas.
- **Autosave vs explicit-save divergence** — recovery slot is separate from the file; recovery is
  offered, never auto-applied over a newer explicit save.
- **Unknown-extension loss** — the `x` bag is asserted present-through-migration by round-trip tests.

## Testing & Evidence

| Layer | Evidence class | Coverage |
|---|---|---|
| `ValueState` invariants | host-level | absent/unknown never serialize a value; resolve returns undefined |
| Schema validate/round-trip | host-level | full + partial fixtures; unknown-field preservation |
| Migration `v0→v1` | host-level | deterministic, id/unit/provenance/unknown preserved (ADR 0007) |
| `.mgproj` save/open | browser-level | Playwright FS Access + fallback round-trip |
| Asset store | browser-level | reload persistence; missing/hash-mismatch diagnosed |
| Autosave/recovery | browser-level | mid-edit reload restores last good state |
| Corrupt/future file | browser-level | each LoadError renders a diagnosable report |
| Board library reuse | browser-level | one board → two mount strategies |
| Parameter hash | generated-geometry-level | stable across reopen; changes on input change |

Fixtures live in `tests/fixtures/boards/` (per MVP plan repository shape). The `v1` fixture is the
canonical Phase 2 artifact and is shared by validation, migration, and later editor tests.

## Open Decisions

- Container packaging (single-JSON vs zip vs directory): gate G1, owned by `ADR 0007`.
- Asset storage default and export-inlining policy: gate G2, owned by `ADR 0007`, privacy aspects to
  `ADR 0008`.
- Final file extension and MIME registration: owned by `ADR 0007` (spike uses `.mgproj` provisionally).
- Whether the board library is a separate IndexedDB store or per-file exports: owned by `ADR 0007`.
- Canonical-model-as-truth posture and the entity set itself: owned by `ADR 0004`.
- Export metadata binding (schema version + parameter hash into the exported file): coordinates with
  `ADR 0006`; this plan only guarantees the hash exists to bind.

## Risks & Counters

| Risk | Counter |
|---|---|
| Inline base64 bloats and slows large-image projects | IndexedDB working copy; inline only on export (G2) |
| Forward-only migrations trap a user on a broken new version | keep the last N autosave slots; version stamp lets an older build refuse cleanly, not corrupt |
| Migration drift silently changes validation meaning | migrators record changed-validation notes (ADR 0007); golden tests catch output drift |
| Unknown ends up as zero via a careless call site | `resolve()`-only reads, guard on write, fixture grep test |
| Shared `.mgproj` leaks a board photo | export warns before inlining; privacy boundary deferred to `ADR 0008`, not assumed safe |
| Recovery overwrites good work | recovery slot separate from file; user-confirmed restore only |
| Schema ossifies before the editor exists | keep `x` extension bags and additive-only rule so Phase 4 editor fields land as migrations, not rewrites |
