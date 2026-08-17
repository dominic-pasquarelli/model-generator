/**
 * Export pipeline (shell scope). Readiness gating and the metadata sidecar are real
 * and honest. Producing a valid STEP/STL body needs the geometry kernel, which is not
 * selected yet (ADR 0006 / STEP_EXPORT_PLAN) — so this build writes a real metadata
 * sidecar and a clearly-labelled placeholder artifact instead of claiming a CAD solid.
 * The export contract, Fusion evidence gate, and true STEP writer are the deferred plan.
 */
import { GENERATOR_VERSION } from "@/core/project/types";
import type { ExportFormat, ExportRecord, Project } from "@/core/project/types";
import { isKnown } from "@/core/project/value";
import { exportReadiness, type ExportReadiness } from "@/core/validation/validate";
import { uid } from "@/lib/id";

export interface ExportMetadata {
  tool: "board-mount-designer";
  generator: string;
  schemaVersion: number;
  units: Project["units"];
  project: { id: string; name: string; version: number };
  paramsHash: string | null;
  format: ExportFormat;
  generatedDimensionsMm: { width: number; depth: number; height: number } | null;
  bodyCount: number | null;
  standoffCount: number | null;
  calibration: { pxPerMm: number; knownMm: number | null; source: string } | null;
  warnings: string[];
  notCadSolid: true;
  note: string;
  createdAtIso: string;
}

const HONEST_NOTE =
  "This build ships an illustrative generator; the artifact is NOT a validated CAD solid. " +
  "A real STEP body and Fusion import evidence are pending kernel selection (see STEP_EXPORT_PLAN / ADR 0006).";

export function exportFileName(project: Project, format: ExportFormat): string {
  const safe = project.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  return `${safe}_v${project.version}.${format}`;
}

export function buildMetadata(project: Project, format: ExportFormat, nowIso: string): ExportMetadata {
  const gen = project.generated;
  const cal = project.calibration;
  return {
    tool: "board-mount-designer",
    generator: GENERATOR_VERSION,
    schemaVersion: project.schemaVersion,
    units: project.units,
    project: { id: project.id, name: project.name, version: project.version },
    paramsHash: gen?.paramsHash ?? null,
    format,
    generatedDimensionsMm: gen ? { width: gen.dims.widthMm, depth: gen.dims.depthMm, height: gen.dims.heightMm } : null,
    bodyCount: gen?.dims.bodies ?? null,
    standoffCount: gen?.dims.standoffCount ?? null,
    calibration:
      cal && cal.status === "valid" && cal.pxPerMm != null
        ? { pxPerMm: cal.pxPerMm, knownMm: isKnown(cal.knownMm) ? cal.knownMm.value : null, source: cal.source }
        : null,
    warnings: gen?.warnings ?? [],
    notCadSolid: true,
    note: HONEST_NOTE,
    createdAtIso: nowIso,
  };
}

export function serializeSidecar(meta: ExportMetadata): string {
  return JSON.stringify(meta, null, 2);
}

/**
 * The placeholder artifact body. For STEP we emit a minimal ISO-10303-21 HEADER with
 * an explicit comment that no geometry section is present — importable-but-empty is
 * honest; a fake solid would not be.
 */
export function buildPlaceholderArtifact(project: Project, format: ExportFormat, meta: ExportMetadata): string {
  if (format === "step") {
    return [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION(('Model Generator placeholder — NO geometry section','${HONEST_NOTE}'),'2;1');`,
      `FILE_NAME('${exportFileName(project, "step")}','${meta.createdAtIso}',('Model Generator'),(''),'${GENERATOR_VERSION}','','');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
      "ENDSEC;",
      "/* No DATA section: a real solid requires the geometry kernel (STEP_EXPORT_PLAN). */",
      "END-ISO-10303-21;",
      "",
    ].join("\n");
  }
  // STL placeholder — a valid empty solid, clearly named.
  return ["solid model_generator_placeholder", "endsolid model_generator_placeholder", ""].join("\n");
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

  const nowIso = options.nowIso ?? new Date(options.now ?? Date.now()).toISOString();
  const now = options.now ?? Date.now();
  const meta = buildMetadata(project, options.format, nowIso);
  const body = buildPlaceholderArtifact(project, options.format, meta);
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
