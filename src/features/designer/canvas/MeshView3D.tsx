import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BracketMesh } from "@/core/geometry/mesh";
import { projectMesh, VIEW_PRESETS, type OrbitCamera, type ViewId } from "./mesh3d";

const MIN_PITCH = 0.03;
const MAX_PITCH = 1.55;

/**
 * Renders a prebuilt bracket solid as flat-shaded, depth-sorted SVG polygons — the same
 * mesh the STL/STEP exporters serialise. It never builds geometry itself: the caller
 * passes the single live build so the rendered mesh and the displayed dimensions/warnings
 * always come from one and the same generation. Drag to orbit; view buttons reset camera.
 */
export function MeshView3D({ mesh, view }: { mesh: BracketMesh | null; view: ViewId }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 520, h: 380 });
  const [cam, setCam] = useState<OrbitCamera>(VIEW_PRESETS[view] ?? VIEW_PRESETS.iso);
  const drag = useRef<{ x: number; y: number; cam: OrbitCamera } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(120, el.clientWidth), h: Math.max(120, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A view-preset button press resets the orbit camera to that canonical angle.
  useEffect(() => {
    setCam(VIEW_PRESETS[view] ?? VIEW_PRESETS.iso);
  }, [view]);

  const projection = useMemo(
    () => (mesh ? projectMesh(mesh, cam, { width: size.w, height: size.h }) : null),
    [mesh, cam, size.w, size.h],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, cam };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const yaw = d.cam.yaw + (e.clientX - d.x) * 0.01;
    const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, d.cam.pitch - (e.clientY - d.y) * 0.01));
    setCam({ yaw, pitch });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      {projection ? (
        <svg
          viewBox={projection.viewBox}
          width="100%"
          height="100%"
          style={{ cursor: drag.current ? "grabbing" : "grab", touchAction: "none", display: "block" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          role="img"
          aria-label="Generated bracket — 3D preview (drag to orbit)"
        >
          {projection.faces.map((f, i) => (
            <polygon key={i} points={f.points} fill={f.fill} stroke={f.fill} strokeWidth={0.6} strokeLinejoin="round" />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
