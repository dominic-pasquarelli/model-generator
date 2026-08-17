import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizeRect, type Point, type Rect } from "@/core/geom";
import type { Project } from "@/core/project/types";
import { useStore } from "@/state/store";
import { OverlayMarks } from "./overlays";

interface Size {
  w: number;
  h: number;
}

/** Fit the image into the available area with margin, then apply zoom. */
function fitScale(img: Size, area: Size, zoom: number): number {
  const margin = 96;
  const fit = Math.min((area.w - margin) / img.w, (area.h - margin) / img.h);
  return Math.max(0.05, fit) * zoom;
}

export function Viewport2D({ project }: { project: Project }) {
  const ref = project.reference!;
  const ui = useStore((s) => s.ui);
  const setTool = useStore((s) => s.setTool);
  const select = useStore((s) => s.select);
  const addHoleAt = useStore((s) => s.addHoleAt);
  const addKeepOutRect = useStore((s) => s.addKeepOutRect);
  const setOutlineRect = useStore((s) => s.setOutlineRect);
  const placeCalibAnchor = useStore((s) => s.placeCalibAnchor);
  const setCursor = useStore((s) => s.setCursor);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [area, setArea] = useState<Size>({ w: 900, h: 700 });
  const [draft, setDraft] = useState<{ start: Point; rect: Rect } | null>(null);
  const panState = useRef<{ startClient: Point; startPan: Point } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = fitScale({ w: ref.widthPx, h: ref.heightPx }, area, ui.zoom);
  const displayW = ref.widthPx * scale;
  const displayH = ref.heightPx * scale;
  const left = (area.w - displayW) / 2 + ui.pan.x;
  const top = (area.h - displayH) / 2 + ui.pan.y;

  /** Map a pointer event to image-pixel coordinates via the overlay's screen CTM. */
  const toImage = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    const tool = ui.activeTool;
    if (tool === "hole") {
      const p = toImage(e.clientX, e.clientY);
      if (p) addHoleAt(p);
      return;
    }
    if (tool === "calibrate") {
      const p = toImage(e.clientX, e.clientY);
      if (p) placeCalibAnchor(p);
      return;
    }
    if (tool === "keepout" || tool === "outline") {
      const p = toImage(e.clientX, e.clientY);
      if (p) setDraft({ start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } });
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === "pan") {
      panState.current = { startClient: { x: e.clientX, y: e.clientY }, startPan: ui.pan };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === "select") {
      select({ kind: "none" });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toImage(e.clientX, e.clientY);
    if (p) setCursor(p);
    if (draft) {
      if (p) setDraft({ start: draft.start, rect: normalizeRect(draft.start, p) });
      return;
    }
    if (panState.current) {
      const dx = e.clientX - panState.current.startClient.x;
      const dy = e.clientY - panState.current.startClient.y;
      useStore.setState((s) => ({ ui: { ...s.ui, pan: { x: panState.current!.startPan.x + dx, y: panState.current!.startPan.y + dy } } }));
    }
  };

  const onPointerUp = () => {
    if (draft) {
      const r = draft.rect;
      const bigEnough = r.w * scale > 6 && r.h * scale > 6;
      if (bigEnough) {
        const a = { x: r.x, y: r.y };
        const b = { x: r.x + r.w, y: r.y + r.h };
        if (ui.activeTool === "keepout") addKeepOutRect(a, b);
        else if (ui.activeTool === "outline") setOutlineRect(a, b);
      }
      setDraft(null);
    }
    panState.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const dir = e.deltaY < 0 ? 0.08 : -0.08;
      useStore.getState().nudgeZoom(dir);
    }
  };

  // Keyboard: Escape cancels a draft; Delete/Backspace removes the current selection
  // (unless the user is typing in a field).
  const deleteHole = useStore((s) => s.deleteHole);
  const deleteKeepOut = useStore((s) => s.deleteKeepOut);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement | null;
        const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (typing) return;
        const sel = useStore.getState().ui.selection;
        if (sel.kind === "hole") {
          e.preventDefault();
          deleteHole(sel.id);
        } else if (sel.kind === "keepout") {
          e.preventDefault();
          deleteKeepOut(sel.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteHole, deleteKeepOut]);

  const cursor =
    ui.activeTool === "pan" ? "grab" : ui.activeTool === "select" ? "default" : "crosshair";

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <div className="photo-wrap" style={{ left, top, width: displayW, height: displayH }}>
        <div
          className="photo-rot"
          style={{ width: displayW, height: displayH, transform: `rotate(${ref.rotationDeg}deg)`, transformOrigin: "50% 50%" }}
        >
          {ref.missing ? (
            <div
              style={{
                width: displayW,
                height: displayH,
                borderRadius: 6,
                background: "#1c2027",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7c8798",
                fontSize: 12,
                border: "1px dashed #39455a",
              }}
            >
              reference image missing
            </div>
          ) : (
            <img src={ref.src} alt={`Reference: ${ref.assetName}`} style={{ width: displayW, height: displayH, borderRadius: 6 }} />
          )}
          <svg
            ref={svgRef}
            className="overlay"
            viewBox={`0 0 ${ref.widthPx} ${ref.heightPx}`}
            style={{ width: displayW, height: displayH, cursor, touchAction: "none" }}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setCursor(null)}
            onWheel={onWheel}
          >
            {/* transparent hit surface so background pointer events fire across the image */}
            <rect x={0} y={0} width={ref.widthPx} height={ref.heightPx} fill="transparent" />
            <OverlayMarks
              project={project}
              selection={ui.selection}
              onSelect={select}
              activeStep={ui.activeStep}
              interactive={ui.activeTool === "select"}
              draftRect={draft?.rect ?? null}
              calibDraft={ui.calibDraft}
            />
          </svg>
        </div>
      </div>
      {/* click-to-place holes should not require the crosshair tool to be re-picked each time */}
      <span className="sr-only">{`Tool: ${ui.activeTool}`}</span>
      <button className="sr-only" onClick={() => setTool("select")}>
        Reset to select tool
      </button>
    </div>
  );
}
