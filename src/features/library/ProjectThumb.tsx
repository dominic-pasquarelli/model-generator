import { bbox } from "@/core/geom";
import type { Project } from "@/core/project/types";

const W = 150;
const H = 96;
const PAD = 18;

/** Abstract mini-schematic drawn from the project's real geometry (not the photo). */
export function ProjectThumb({ project }: { project: Project }) {
  const outline = project.board.outline;
  const calibrated = project.calibration?.status === "valid";

  if (!outline || outline.vertices.length < 3) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <rect
          x={34}
          y={22}
          width={82}
          height={52}
          rx={4}
          fill="none"
          stroke="#3fd0e4"
          strokeWidth={1.8}
          strokeDasharray="5 4"
          opacity={0.75}
        />
        <circle cx={44} cy={32} r={3.4} fill="none" stroke="#67707f" strokeWidth={1.6} />
        <circle cx={106} cy={64} r={3.4} fill="none" stroke="#67707f" strokeWidth={1.6} />
      </svg>
    );
  }

  const box = bbox(outline.vertices);
  const scale = Math.min((W - 2 * PAD) / box.w, (H - 2 * PAD) / box.h);
  const offX = (W - box.w * scale) / 2;
  const offY = (H - box.h * scale) / 2;
  const tx = (x: number) => offX + (x - box.x) * scale;
  const ty = (y: number) => offY + (y - box.y) * scale;

  const holeColor = calibrated ? "#8b93f8" : "#67707f";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect
        x={tx(box.x)}
        y={ty(box.y)}
        width={box.w * scale}
        height={box.h * scale}
        rx={5}
        fill="none"
        stroke="#3fd0e4"
        strokeWidth={1.8}
        strokeDasharray={calibrated ? undefined : "5 4"}
        opacity={calibrated ? 1 : 0.8}
      />
      {project.board.keepOuts.map((k) => {
        if (k.shape === "rect" && k.rectPx) {
          return (
            <rect
              key={k.id}
              x={tx(k.rectPx.x)}
              y={ty(k.rectPx.y)}
              width={k.rectPx.w * scale}
              height={k.rectPx.h * scale}
              fill="none"
              stroke="#f4695f"
              strokeWidth={1.4}
              strokeDasharray="3 2.4"
            />
          );
        }
        if (k.shape === "circle" && k.circlePx) {
          return (
            <circle
              key={k.id}
              cx={tx(k.circlePx.center.x)}
              cy={ty(k.circlePx.center.y)}
              r={k.circlePx.radiusPx * scale}
              fill="none"
              stroke="#f4695f"
              strokeWidth={1.4}
              strokeDasharray="3 2.4"
            />
          );
        }
        return null;
      })}
      {project.board.holes.map((h) => (
        <circle
          key={h.id}
          cx={tx(h.centerPx.x)}
          cy={ty(h.centerPx.y)}
          r={3.4}
          fill="none"
          stroke={holeColor}
          strokeWidth={1.6}
        />
      ))}
    </svg>
  );
}
