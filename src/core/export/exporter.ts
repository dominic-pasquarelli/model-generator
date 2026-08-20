/**
 * Export pipeline. Readiness gating and the metadata sidecar remain real and honest; the
 * artifact body is a REAL generated solid. STL is a watertight print mesh; STEP is a
 * faceted B-rep (curved faces approximated as facets).
 *
 * Exact-build provenance (reviewer #3): a single {@link ArtifactBuildSnapshot} is produced
 * from one successful {@link buildBracketMesh} call, and the body, dimensions, warnings,
 * parameter hash, mesh hash, sidecar, and export record are ALL derived from that one
 * snapshot — nothing is read from `project.generated`. The sidecar carries the complete
 * effective mm recipe plus the mesh hash, and {@link assembleSolid} rebuilds the identical
 * solid from that recipe (verified by hash in the tests), so the sidecar reconstructs what
 * was cut without guessing.
 *
 * Honesty boundary that still holds: the STEP structure is host-level verified against the
 * internal properties in step.ts (reference-complete graph, one closed shell, each edge
 * shared by two oppositely-sensed faces) — NOT an independent EXPRESS/AP214 kernel. STL is
 * a generated ASCII mesh; downstream slicer compatibility is not yet verified. Autodesk
 * Fusion import and printed-part fit remain unverified evidence gates (ADR 0006).
 */
import { buildBracketMesh, MIN_BOSS_WALL_MM, type BracketMesh, type EffectiveParams, type EffectiveValue, type SolidRecipe } from "@/core/geometry/mesh";
import { ACTIVE_ADAPTER_VERSION } from "@/core/geometry/adapter";
import { generationKey } from "@/core/project/derive";
import { GENERATOR_VERSION } from "@/core/project/types";
import type { ExportFormat, ExportRecord, GeneratedDimensions, Project } from "@/core/project/types";
import { isKnown, type Val } from "@/core/project/value";
import { exportReadiness, type ExportReadiness } from "@/core/validation/validate";
import { uid } from "@/lib/id";
import { meshToAsciiStl } from "./stl";
import { meshToStep } from "./step";

/**
 * A fabrication dimension the generator actually used, with its provenance AND the raw
 * model input it resolved from — so an auditor can see requested-vs-effective at a glance.
 */
export interface ParamDimReport {
  effectiveMm: number;
  source: EffectiveValue["source"];
  requested: { known: false } | { known: true; valueMm: number; source: string };
}

/**
 * The complete, auditable parameter snapshot the artifact was built from (reviewer #3/#4).
 * Every dimension and the full mm geometry recipe appear here, so the sidecar reconstructs
 * exactly what was cut.
 */
export interface ExportParameters {
  strategy: EffectiveParams["strategy"];
  fastenerStyle: EffectiveParams["fastenerStyle"];
  tolerance: EffectiveParams["tolerance"];
  toleranceOffsetMm: number;
  cornerRadiusMm: number;
  /** Per-corner requested-vs-effective fillet radius (clamped corners recorded honestly). */
  corners: { requestedRadiusMm: number; effectiveRadiusMm: number; clamped: boolean }[];
  wallMm: number;
  plateOffsetMm: number;
  segments: number;
  /** Generator constants that affect topology. */
  minBossWallMm: number;
  weldToleranceMm: number;
  contactToleranceMm: number;
  sideTabs: 0 | 2 | 4;
  tabs: { edgeIndex: number; widthMm: number; depthMm: number; boreCenterMm: { x: number; y: number }; boreRadiusMm: number }[];
  /** Effective plate outline the solid was built on (board-space mm). */
  plateOutlineMm: { x: number; y: number }[];
  /** Requested board outline (mm) when the strategy consumes it, else null. */
  requestedOutlineMm: { x: number; y: number }[] | null;
  keepOuts: { label: string; subtracted: boolean; reason: string | null }[];
  baseThicknessMm: ParamDimReport;
  standoffHeightMm: ParamDimReport;
  bossDiameterMm: ParamDimReport;
  clearanceMm: ParamDimReport;
  standoffs: {
    label: string;
    centerMm: { x: number; y: number };
    requestedDiameterMm: ParamDimReport["requested"];
    bossDiameterMm: number;
    boreDiameterMm: number;
    through: boolean;
  }[];
}

export interface ExportMetadata {
  tool: "board-mount-designer";
  generator: string;
  /** Provenance of the geometry path — the self-contained solid generator. */
  kernel: string;
  schemaVersion: number;
  project: { id: string; name: string; version: number };
  paramsHash: string | null;
  /** Deterministic hash of the welded solid — ties this sidecar to the serialised body. */
  meshHash: string;
  format: ExportFormat;
  /** Units of the ARTIFACT geometry — always millimetres, independent of the UI. */
  geometryUnits: "mm";
  /** The UI display preference only; never a claim about the geometry's units. */
  displayUnits: Project["units"];
  /** What kind of geometry this artifact carries. */
  geometry: "faceted-brep" | "mesh";
  generatedDimensionsMm: { width: number; depth: number; height: number };
  bodyCount: number;
  standoffCount: number;
  triangleCount: number;
  /** Full auditable parameter snapshot the solid was built from (effective + requested). */
  parameters: ExportParameters;
  /** The exact pure-mm recipe assembleSolid consumed — reconstructs the identical solid. */
  geometryRecipe: SolidRecipe;
  calibration: { pxPerMm: number; knownMm: number | null; source: string } | null;
  warnings: string[];
  note: string;
  /** Claims deliberately NOT made — recorded so downstream never over-reads the file. */
  unsupportedClaims: string[];
  createdAtIso: string;
}

const HONEST_NOTE =
  "Real generated solid from the canonical model, in MILLIMETRES (STL is unitless — its coordinates are mm; STEP " +
  "declares mm). The solid is a single connected watertight manifold, verified host-level by an aggregate audit " +
  "(one component, every edge shared by exactly two oppositely-oriented triangles, single manifold vertex fans, " +
  "positive volume). STEP is a FACETED B-rep (curved standoff walls and bores are facets, not analytic surfaces); its " +
  "structure is checked against the internal properties in step.ts, NOT an independent EXPRESS/AP214 kernel. STL is a " +
  "generated ASCII mesh; downstream slicer compatibility is not yet verified. `geometryRecipe` plus `meshHash` let the " +
  "solid be reconstructed and checked. Autodesk Fusion import and printed-part fit are NOT yet verified (ADR 0006).";

const UNSUPPORTED_CLAIMS = [
  "step-not-validated-by-independent-kernel",
  "stl-slicer-compatibility-unverified",
  "fusion-import-not-yet-verified",
  "no-analytic-curved-surfaces-in-step",
  "printed-part-fit-unverified",
  "no-parametric-editability-in-fusion",
];

export function exportFileName(project: Project, format: ExportFormat): string {
  const safe = project.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  return `${safe}_v${project.version}.${format}`;
}

function safeProductName(project: Project): string {
  return project.name.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase() || "board_mount";
}

/** The immutable record of one successful build — the single source for every export output. */
export interface ArtifactBuildSnapshot {
  mesh: BracketMesh;
  dims: GeneratedDimensions;
  warnings: string[];
  effective: EffectiveParams;
  recipe: SolidRecipe;
  meshHash: string;
  /** Canonical generation key (hash of the geometry-affecting model), or "" if unavailable. */
  generationKey: string;
}

/** Describe the raw model input a dimension resolved from (for requested-vs-effective). */
function requestedDim(v: Val<number>): ParamDimReport["requested"] {
  return isKnown(v) ? { known: true, valueMm: v.value, source: v.source } : { known: false };
}

function paramDim(effective: EffectiveValue, requested: Val<number>): ParamDimReport {
  return { effectiveMm: effective.value, source: effective.source, requested: requestedDim(requested) };
}

/** Build the full auditable parameter snapshot from the effective params + raw inputs. */
function buildParameters(project: Project, effective: EffectiveParams): ExportParameters {
  const m = project.mount;
  const holeByLabel = new Map(project.board.holes.map((h) => [h.label, h] as const));
  return {
    strategy: effective.strategy,
    fastenerStyle: effective.fastenerStyle,
    tolerance: effective.tolerance,
    toleranceOffsetMm: effective.toleranceOffsetMm,
    cornerRadiusMm: effective.cornerRadiusMm,
    corners: effective.corners.map((c) => ({ requestedRadiusMm: c.requestedRadiusMm, effectiveRadiusMm: c.effectiveRadiusMm, clamped: c.clamped })),
    wallMm: effective.wallMm,
    plateOffsetMm: effective.plateOffsetMm,
    segments: effective.segments,
    minBossWallMm: MIN_BOSS_WALL_MM,
    weldToleranceMm: effective.weldToleranceMm,
    contactToleranceMm: effective.contactToleranceMm,
    sideTabs: effective.sideTabs,
    tabs: effective.tabs.map((t) => ({
      edgeIndex: t.edgeIndex,
      widthMm: t.widthMm,
      depthMm: t.depthMm,
      boreCenterMm: { x: t.boreCenterMm.x, y: t.boreCenterMm.y },
      boreRadiusMm: t.boreRadiusMm,
    })),
    plateOutlineMm: effective.plateOutlineMm.map((p) => ({ x: p.x, y: p.y })),
    requestedOutlineMm: effective.requestedOutlineMm ? effective.requestedOutlineMm.map((p) => ({ x: p.x, y: p.y })) : null,
    keepOuts: effective.keepOuts.map((k) => ({ label: k.label, subtracted: k.subtracted, reason: k.reason })),
    baseThicknessMm: paramDim(effective.baseThicknessMm, m.baseThicknessMm),
    standoffHeightMm: paramDim(effective.standoffHeightMm, m.standoffHeightMm),
    bossDiameterMm: paramDim(effective.bossDiameterMm, m.bossDiameterMm),
    clearanceMm: paramDim(effective.clearanceMm, m.clearanceMm),
    standoffs: effective.standoffs.map((s) => {
      const h = holeByLabel.get(s.label);
      return {
        label: s.label,
        centerMm: { x: s.centerMm.x, y: s.centerMm.y },
        requestedDiameterMm: h ? requestedDim(h.diameterMm) : { known: false },
        bossDiameterMm: s.bossDiameterMm,
        boreDiameterMm: s.boreDiameterMm,
        through: s.through,
      };
    }),
  };
}

/** Build the sidecar metadata from the immutable snapshot (never from project.generated). */
export function buildMetadata(project: Project, format: ExportFormat, snapshot: ArtifactBuildSnapshot, nowIso: string): ExportMetadata {
  const cal = project.calibration;
  return {
    tool: "board-mount-designer",
    generator: GENERATOR_VERSION,
    kernel: `${ACTIVE_ADAPTER_VERSION} (self-contained faceted solid)`,
    schemaVersion: project.schemaVersion,
    geometryUnits: "mm",
    displayUnits: project.units,
    project: { id: project.id, name: project.name, version: project.version },
    paramsHash: snapshot.generationKey || null,
    meshHash: snapshot.meshHash,
    format,
    geometry: format === "step" ? "faceted-brep" : "mesh",
    generatedDimensionsMm: { width: snapshot.dims.widthMm, depth: snapshot.dims.depthMm, height: snapshot.dims.heightMm },
    bodyCount: snapshot.mesh.bodies.length,
    standoffCount: snapshot.effective.standoffs.length,
    triangleCount: snapshot.mesh.triangleCount,
    parameters: buildParameters(project, snapshot.effective),
    geometryRecipe: snapshot.recipe,
    calibration:
      cal && cal.status === "valid" && cal.pxPerMm != null
        ? { pxPerMm: cal.pxPerMm, knownMm: isKnown(cal.knownMm) ? cal.knownMm.value : null, source: cal.source }
        : null,
    warnings: snapshot.warnings,
    note: HONEST_NOTE,
    unsupportedClaims: UNSUPPORTED_CLAIMS,
    createdAtIso: nowIso,
  };
}

export function serializeSidecar(meta: ExportMetadata): string {
  return JSON.stringify(meta, null, 2);
}

export interface ExportArtifact {
  fileName: string;
  format: ExportFormat;
  body: string;
  sidecar: string | null;
  metadata: ExportMetadata;
  record: ExportRecord;
}

export interface ExportOptions {
  format: ExportFormat;
  writeSidecar: boolean;
  nowIso?: string;
  now?: number;
}

export type BuildExportResult =
  | { ok: true; artifact: ExportArtifact }
  | { ok: false; readiness: ExportReadiness };

export function buildExport(project: Project, options: ExportOptions): BuildExportResult {
  const readiness = exportReadiness(project);
  if (!readiness.ready) return { ok: false, readiness };

  // The readiness gate guarantees the solid can be built; treat a failure here (including a
  // failed manifold audit) as a hard, diagnosable blocker rather than writing a bad file.
  const meshResult = buildBracketMesh(project);
  if (!meshResult.ok) {
    return {
      ok: false,
      readiness: {
        ready: false,
        blockers: [
          {
            id: "geometry-build-failed",
            severity: "error",
            title: "Solid could not be built",
            body: `${meshResult.error.code}: ${meshResult.error.message}`,
          },
        ],
        checklist: readiness.checklist,
      },
    };
  }

  // One immutable snapshot; every output below is derived from it (reviewer #3).
  const snapshot: ArtifactBuildSnapshot = {
    mesh: meshResult.mesh,
    dims: meshResult.dims,
    warnings: meshResult.warnings,
    effective: meshResult.effective,
    recipe: meshResult.recipe,
    meshHash: meshResult.meshHash,
    generationKey: generationKey(project) ?? "",
  };

  const nowIso = options.nowIso ?? new Date(options.now ?? Date.now()).toISOString();
  const now = options.now ?? Date.now();
  const meta = buildMetadata(project, options.format, snapshot, nowIso);

  const body =
    options.format === "step"
      ? meshToStep(snapshot.mesh, {
          productName: safeProductName(project),
          author: "Model Generator",
          organization: "local",
          createdIso: nowIso,
          originatingSystem: GENERATOR_VERSION,
        })
      : meshToAsciiStl(snapshot.mesh, safeProductName(project));

  const sidecar = options.writeSidecar ? serializeSidecar(meta) : null;
  const fileName = exportFileName(project, options.format);
  const record: ExportRecord = {
    id: uid("exp"),
    format: options.format,
    fileName,
    sizeBytes: new Blob([body]).size,
    paramsHash: snapshot.generationKey,
    generationKey: snapshot.generationKey,
    createdAt: now,
    wroteSidecar: options.writeSidecar,
  };
  return { ok: true, artifact: { fileName, format: options.format, body, sidecar, metadata: meta, record } };
}
