/**
 * Export pipeline. Readiness gating and the metadata sidecar remain real and honest;
 * the artifact body is now a REAL generated solid, not a placeholder. STL is a
 * watertight print mesh; STEP is a faceted B-rep (curved faces approximated as facets).
 * Both are tessellations of the same solid the preview consumes (shared geometry path).
 *
 * Honesty boundary that still holds: the artifacts are host-level verified (closed
 * manifold, valid ISO-10303-21 structure), but Autodesk Fusion import and printed-part
 * fit are NOT yet verified. Those remain the evidence gates owned by ADR 0006.
 */
import { buildBracketMesh } from "@/core/geometry/mesh";
import { ACTIVE_ADAPTER_VERSION } from "@/core/geometry/adapter";
import { GENERATOR_VERSION } from "@/core/project/types";
import type { ExportFormat, ExportRecord, Project } from "@/core/project/types";
import { isKnown } from "@/core/project/value";
import { exportReadiness, type ExportReadiness } from "@/core/validation/validate";
import { uid } from "@/lib/id";
import { meshToAsciiStl } from "./stl";
import { meshToStep } from "./step";

export interface ExportMetadata {
  tool: "board-mount-designer";
  generator: string;
  /** Provenance of the geometry path — the self-contained solid generator. */
  kernel: string;
  schemaVersion: number;
  units: Project["units"];
  project: { id: string; name: string; version: number };
  paramsHash: string | null;
  format: ExportFormat;
  /** What kind of geometry this artifact carries. */
  geometry: "faceted-brep" | "mesh";
  generatedDimensionsMm: { width: number; depth: number; height: number } | null;
  bodyCount: number | null;
  standoffCount: number | null;
  triangleCount: number | null;
  calibration: { pxPerMm: number; knownMm: number | null; source: string } | null;
  warnings: string[];
  note: string;
  /** Claims deliberately NOT made — recorded so downstream never over-reads the file. */
  unsupportedClaims: string[];
  createdAtIso: string;
}

const HONEST_NOTE =
  "Real generated solid from the canonical model. STL is a watertight print mesh; STEP is a faceted B-rep " +
  "(curved standoff walls and bores are facets, not analytic surfaces). Verified host-level (closed manifold, " +
  "valid ISO-10303-21 structure). Autodesk Fusion import and printed-part fit are NOT yet verified (ADR 0006).";

const UNSUPPORTED_CLAIMS = [
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

export function buildMetadata(
  project: Project,
  format: ExportFormat,
  geom: { dims: { widthMm: number; depthMm: number; heightMm: number }; bodyCount: number; triangleCount: number } | null,
  nowIso: string,
): ExportMetadata {
  const gen = project.generated;
  const cal = project.calibration;
  return {
    tool: "board-mount-designer",
    generator: GENERATOR_VERSION,
    kernel: `${ACTIVE_ADAPTER_VERSION} (self-contained faceted solid)`,
    schemaVersion: project.schemaVersion,
    units: project.units,
    project: { id: project.id, name: project.name, version: project.version },
    paramsHash: gen?.paramsHash ?? null,
    format,
    geometry: format === "step" ? "faceted-brep" : "mesh",
    generatedDimensionsMm: geom ? { width: geom.dims.widthMm, depth: geom.dims.depthMm, height: geom.dims.heightMm } : null,
    bodyCount: geom?.bodyCount ?? gen?.dims.bodies ?? null,
    standoffCount: gen?.dims.standoffCount ?? null,
    triangleCount: geom?.triangleCount ?? gen?.dims.triangles ?? null,
    calibration:
      cal && cal.status === "valid" && cal.pxPerMm != null
        ? { pxPerMm: cal.pxPerMm, knownMm: isKnown(cal.knownMm) ? cal.knownMm.value : null, source: cal.source }
        : null,
    warnings: gen?.warnings ?? [],
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

  // The readiness gate guarantees the solid can be built; treat a failure here as a hard,
  // diagnosable blocker rather than writing an empty file.
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
  const mesh = meshResult.mesh;

  const nowIso = options.nowIso ?? new Date(options.now ?? Date.now()).toISOString();
  const now = options.now ?? Date.now();
  const geom = { dims: meshResult.dims, bodyCount: mesh.bodies.length, triangleCount: mesh.triangleCount };
  const meta = buildMetadata(project, options.format, geom, nowIso);

  const body =
    options.format === "step"
      ? meshToStep(mesh, {
          productName: safeProductName(project),
          author: "Model Generator",
          organization: "local",
          createdIso: nowIso,
          originatingSystem: GENERATOR_VERSION,
        })
      : meshToAsciiStl(mesh, safeProductName(project));

  const sidecar = options.writeSidecar ? serializeSidecar(meta) : null;
  const fileName = exportFileName(project, options.format);
  const record: ExportRecord = {
    id: uid("exp"),
    format: options.format,
    fileName,
    sizeBytes: new Blob([body]).size,
    paramsHash: project.generated?.paramsHash ?? "",
    generationKey: project.generated?.key ?? "",
    createdAt: now,
    wroteSidecar: options.writeSidecar,
  };
  return { ok: true, artifact: { fileName, format: options.format, body, sidecar, metadata: meta, record } };
}
