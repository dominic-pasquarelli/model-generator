import { bbox, rectIntersectsCircle, circlesOverlap, type Point, type Rect } from "@/core/geom";
import type { KeepOut, MountingHole, Project } from "@/core/project/types";
import { isKnown, maybe } from "@/core/project/value";
import { standoffSeatRadiusPx } from "@/core/project/derive";
import type { Selection } from "@/state/store";
import type { StepId } from "@/core/validation/validate";

/** Colors are theme-invariant (the canvas is always dark). Values from COMPONENT_SPEC. */
const C = {
  outline: "#20d3e8",
  vertexFill: "#ffffff",
  vertexStroke: "#0b7f90",
  holeConfirmed: "#3ddc97",
  holeMeasured: "#5aa4f8",
  holeInferred: "#f0b13e",
  holeSelected: "#8b93f8",
  keepFill: "rgba(244,105,96,0.13)",
  keepStroke: "#f4695f",
  keepSelected: "#fb8f76",
  calib: "#fbbf24",
  calibBad: "#f4695f",
  conflict: "#fbbf24",
};

function pillColors(kind: "confirmed" | "measured" | "missing" | "inferred" | "neutral") {
  switch (kind) {
    case "confirmed":
      return { bg: "#0d2a1e", border: "#2c8e63", text: "#7ce7b6" };
    case "measured":
      return { bg: "#0e2136", border: "#31639f", text: "#9cc5fb" };
    case "missing":
      return { bg: "#211122", border: "#a13d63", text: "#ff9db4" };
    case "inferred":
      return { bg: "#2b2210", border: "#8f6d24", text: "#f5d78e" };
    default:
      return { bg: "#151a22", border: "#3a4453", text: "#fbd88a" };
  }
}

function LabelPill({ x, y, text, kind, k }: { x: number; y: number; text: string; kind: Parameters<typeof pillColors>[0]; k: number }) {
  const col = pillColors(kind);
  const w = (text.length * 9 + 26) * k;
  const h = 32 * k;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={16 * k} fill={col.bg} stroke={col.border} />
      <text
        x={x + w / 2}
        y={y + h * 0.68}
        textAnchor="middle"
        fontSize={17 * k}
        fontWeight={650}
        fontFamily="Inter Variable, Inter, sans-serif"
        fill={col.text}
      >
        {text}
      </text>
    </g>
  );
}

function holeColor(h: MountingHole, selected: boolean): string {
  if (selected) return C.holeSelected;
  if (!isKnown(h.diameterMm)) return C.holeSelected;
  if (h.state === "confirmed") return C.holeConfirmed;
  if (h.state === "inferred") return C.holeInferred;
  return C.holeMeasured;
}

function HoleMark({
  hole,
  selected,
  conflict,
  k,
  onSelect,
  interactive,
}: {
  hole: MountingHole;
  selected: boolean;
  conflict: boolean;
  k: number;
  onSelect: () => void;
  interactive: boolean;
}) {
  const { x, y } = hole.centerPx;
  const missing = !isKnown(hole.diameterMm);
  const color = holeColor(hole, selected);
  const r = (selected ? 30 : 26) * k;
  const dash = hole.state === "inferred" ? "7 5" : undefined;
  const dia = maybe(hole.diameterMm);
  const pillKind = missing ? "missing" : hole.state === "confirmed" ? "confirmed" : hole.state === "inferred" ? "inferred" : "measured";
  const pillText = missing
    ? `${hole.label} ⌀ —`
    : hole.state === "inferred"
      ? `${hole.label} inferred`
      : `${hole.label} ⌀${dia?.toFixed(2)}${hole.state === "confirmed" ? " ✓" : ""}`;
  return (
    <g
      style={{ cursor: interactive ? "pointer" : "inherit", pointerEvents: interactive ? "auto" : "none" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {selected ? (
        <circle cx={x} cy={y} r={40 * k} fill="none" stroke={C.holeSelected} strokeWidth={2 * k} strokeDasharray="6 5" opacity={0.8} />
      ) : null}
      {conflict ? <circle cx={x} cy={y} r={34 * k} fill="none" stroke={C.conflict} strokeWidth={4 * k} /> : null}
      <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={(selected ? 4 : 3) * k} strokeDasharray={dash} />
      <path
        d={`M${x} ${y - r - 8 * k}v${-14 * k}M${x} ${y + r + 8 * k}v${14 * k}M${x - r - 8 * k} ${y}h${-14 * k}M${x + r + 8 * k} ${y}h${14 * k}`}
        stroke={color}
        strokeWidth={3 * k}
      />
      <LabelPill x={x + 30 * k} y={y + 27 * k} text={pillText} kind={pillKind} k={k} />
    </g>
  );
}

function keepBox(k: KeepOut): Rect | null {
  if (k.shape === "rect" && k.rectPx) return k.rectPx;
  if (k.shape === "circle" && k.circlePx)
    return {
      x: k.circlePx.center.x - k.circlePx.radiusPx,
      y: k.circlePx.center.y - k.circlePx.radiusPx,
      w: k.circlePx.radiusPx * 2,
      h: k.circlePx.radiusPx * 2,
    };
  if (k.shape === "polygon" && k.polygonPx && k.polygonPx.length >= 3) return bbox(k.polygonPx);
  return null;
}

function KeepOutMark({
  ko,
  selected,
  k,
  onSelect,
  interactive,
}: {
  ko: KeepOut;
  selected: boolean;
  k: number;
  onSelect: () => void;
  interactive: boolean;
}) {
  const stroke = selected ? C.keepSelected : C.keepStroke;
  const common = {
    fill: C.keepFill,
    stroke,
    strokeWidth: (selected ? 3.5 : 3) * k,
    strokeDasharray: selected ? undefined : "9 6",
  };
  let shapeEl: React.ReactNode = null;
  let labelAt: Point | null = null;
  if (ko.shape === "rect" && ko.rectPx) {
    const r = ko.rectPx;
    shapeEl = <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={10 * k} {...common} />;
    labelAt = { x: r.x, y: r.y - 40 * k };
  } else if (ko.shape === "circle" && ko.circlePx) {
    const c = ko.circlePx;
    shapeEl = <circle cx={c.center.x} cy={c.center.y} r={c.radiusPx} {...common} />;
    labelAt = { x: c.center.x - c.radiusPx, y: c.center.y - c.radiusPx - 40 * k };
  }
  return (
    <g
      style={{ cursor: interactive ? "pointer" : "inherit", pointerEvents: interactive ? "auto" : "none" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {shapeEl}
      {labelAt ? <LabelPill x={labelAt.x} y={labelAt.y} text={ko.label} kind="missing" k={k} /> : null}
    </g>
  );
}

function OutlineMark({ vertices, selected, k }: { vertices: Point[]; selected: boolean; k: number }) {
  const d = vertices.map((v, i) => `${i === 0 ? "M" : "L"}${v.x} ${v.y}`).join(" ") + " Z";
  return (
    <g>
      <path d={d} fill="none" stroke={C.outline} strokeWidth={3.5 * k} />
      {selected
        ? vertices.map((v, i) => (
            <rect
              key={i}
              x={v.x - 9 * k}
              y={v.y - 9 * k}
              width={18 * k}
              height={18 * k}
              rx={3 * k}
              fill={C.vertexFill}
              stroke={C.vertexStroke}
              strokeWidth={2.5 * k}
            />
          ))
        : null}
    </g>
  );
}

function CalibrationMark({ project, k }: { project: Project; k: number }) {
  const cal = project.calibration;
  if (!cal) return null;
  const [a, b] = cal.anchors;
  const bad = cal.status === "invalid";
  const color = bad ? C.calibBad : C.calib;
  const px = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * (project.reference ? project.reference.widthPx / 1000 : 1));
  void px;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={3.5 * k} />
      {[a, b].map((p, i) => (
        <g key={i}>
          <line x1={p.x} y1={p.y - 25 * k} x2={p.x} y2={p.y + 25 * k} stroke={color} strokeWidth={2 * k} />
          <circle cx={p.x} cy={p.y} r={13 * k} fill="none" stroke={color} strokeWidth={2.5 * k} />
          <circle cx={p.x} cy={p.y} r={3.5 * k} fill={color} />
          <rect x={p.x - 15 * k} y={p.y - 67 * k} width={30 * k} height={30 * k} rx={8 * k} fill={color} />
          <text
            x={p.x}
            y={p.y - 46 * k}
            textAnchor="middle"
            fontSize={20 * k}
            fontWeight={650}
            fontFamily="Inter Variable, Inter, sans-serif"
            fill={bad ? "#2b0d0a" : "#231a02"}
          >
            {i === 0 ? "A" : "B"}
          </text>
        </g>
      ))}
      <LabelPill
        x={mid.x - 72 * k}
        y={mid.y + 10 * k}
        text={bad ? `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px ✗` : `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px`}
        kind={bad ? "missing" : "neutral"}
        k={k}
      />
    </g>
  );
}

/** Which holes conflict with a keep-out standoff seat (for conflict rings). */
function conflictHoleIds(project: Project): Set<string> {
  const ids = new Set<string>();
  const seat = standoffSeatRadiusPx(project);
  if (seat == null) return ids; // unknown boss diameter → no fabricated seat
  for (const h of project.board.holes) {
    for (const ko of project.board.keepOuts) {
      const box = keepBox(ko);
      if (ko.shape === "circle" && ko.circlePx) {
        if (circlesOverlap(h.centerPx, seat, ko.circlePx.center, ko.circlePx.radiusPx)) ids.add(h.id);
      } else if (box && rectIntersectsCircle(box, h.centerPx, seat)) {
        ids.add(h.id);
      }
    }
  }
  return ids;
}

export function OverlayMarks({
  project,
  selection,
  onSelect,
  activeStep,
  interactive,
  draftRect,
}: {
  project: Project;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  activeStep: StepId;
  interactive: boolean;
  draftRect: Rect | null;
}) {
  const k = project.reference ? project.reference.widthPx / 1000 : 1;
  const conflicts = conflictHoleIds(project);
  const outline = project.board.outline;
  const showCalib = activeStep === "calibrate" && !!project.calibration;

  return (
    <>
      {outline ? (
        <OutlineMark vertices={outline.vertices} selected={selection.kind === "outline" || activeStep === "outline"} k={k} />
      ) : null}

      {project.board.keepOuts.map((ko) => (
        <KeepOutMark
          key={ko.id}
          ko={ko}
          selected={selection.kind === "keepout" && selection.id === ko.id}
          k={k}
          interactive={interactive}
          onSelect={() => onSelect({ kind: "keepout", id: ko.id })}
        />
      ))}

      {project.board.holes.map((h) => (
        <HoleMark
          key={h.id}
          hole={h}
          selected={selection.kind === "hole" && selection.id === h.id}
          conflict={conflicts.has(h.id)}
          k={k}
          interactive={interactive}
          onSelect={() => onSelect({ kind: "hole", id: h.id })}
        />
      ))}

      {showCalib ? <CalibrationMark project={project} k={k} /> : null}

      {draftRect ? (
        <rect
          x={draftRect.x}
          y={draftRect.y}
          width={draftRect.w}
          height={draftRect.h}
          fill="rgba(79,70,229,0.14)"
          stroke="#8b93f8"
          strokeWidth={2.5 * k}
          strokeDasharray="8 5"
        />
      ) : null}
    </>
  );
}
