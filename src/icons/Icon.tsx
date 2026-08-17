import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Lucide-style inline icon set (viewBox 0 0 24 24, stroke currentColor).
 * Every glyph used across the Board Mount Designer mockups lives here so the app
 * never depends on an external icon font/CDN. Paths are transcribed from
 * docs/design/mockups/src/*.html.
 */
const PATHS: Record<string, ReactNode> = {
  // --- brand / chrome ---
  cube: (
    <>
      <path d="M21 8l-9-4.8L3 8v8l9 4.8L21 16z" />
      <path d="M3 8l9 4.6L21 8" />
      <path d="M12 12.6V20.8" />
    </>
  ),
  "cube-flat": <path d="M21 8l-9-4.8L3 8v8l9 4.8L21 16z" />,
  menu: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="17" r="2" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  undo: (
    <>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
    </>
  ),
  redo: (
    <>
      <path d="M21 7v6h-6" />
      <path d="M21 13a9 9 0 1 1-3-7.7L21 7" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12M6 11l6 6 6-6" />
      <path d="M5 21h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M6 9l6-6 6 6" />
      <path d="M4 20h16" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M3 16l5-4 4 3 4-4 5 4" />
    </>
  ),
  "image-off": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 16l5-4 4 3 4-4 5 4" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </>
  ),
  file: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M14 3v5h5" />
    </>
  ),

  // --- board / tools ---
  board: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="15" cy="15" r="1.6" />
      <path d="M9 15h3M15 9v3" />
    </>
  ),
  assembly: (
    <>
      <rect x="3" y="12" width="8" height="8" rx="1.5" />
      <rect x="13" y="12" width="8" height="8" rx="1.5" />
      <rect x="8" y="3" width="8" height="8" rx="1.5" />
    </>
  ),
  cursor: <path d="M3 3l7.5 18 2.4-7.8L21 10.7z" />,
  hand: (
    <>
      <path d="M7 11.5V7a5 5 0 0 1 10 0v4.5" />
      <path d="M5 11h14v4a7 7 0 0 1-14 0z" />
    </>
  ),
  ruler: (
    <>
      <path d="M3 17L17 3l4 4L7 21l-4-4z" />
      <path d="M8 12l2 2M11 9l2 2M14 6l2 2" />
    </>
  ),
  "ruler-plain": <path d="M3 17L17 3l4 4L7 21l-4-4z" />,
  polygon: (
    <>
      <path d="M12 4l8 5v6l-8 5-8-5V9z" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="4" cy="9" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  "cube-outline": <path d="M12 4l8 5v6l-8 5-8-5V9z" />,
  hole: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  "hole-ring": <circle cx="12" cy="12" r="7" />,
  keepout: <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="4 3" />,
  "keepout-sm": <rect x="5" y="5" width="14" height="14" rx="2" strokeDasharray="4 3" />,
  "circle-dashed": <circle cx="12" cy="12" r="7" strokeDasharray="4 3" />,
  "square-outline": <rect x="4" y="4" width="16" height="16" rx="2" />,
  "calibration-line": <path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />,
  magnet: (
    <>
      <path d="M6 15V9a6 6 0 0 1 12 0v6" />
      <path d="M6 15a3 3 0 0 0 6 0M12 15a3 3 0 0 0 6 0" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  fit: <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />,
  approx: <path d="M5 13c2-3.6 4-3.6 6 0s4 3.6 6 0" strokeWidth={2} />,

  // --- status / validation ---
  check: <path d="M20 6L9 17l-4-4" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-left": <path d="M15 18l-6-6 6-6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.6" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  triangle: (
    <>
      <path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17.4" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  "x-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </>
  ),
  spinner: <path d="M12 3a9 9 0 1 1-8.6 6.3" strokeWidth={2.4} />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Extra class, added after the base `ic` class. Size variants: `ic-sm`, `ic-lg`. */
  className?: string;
  title?: string;
}

export function Icon({ name, className, title, ...rest }: IconProps) {
  const inner = PATHS[name];
  if (import.meta.env?.DEV && !inner) {
    // eslint-disable-next-line no-console
    console.warn(`Icon: unknown name "${String(name)}"`);
  }
  return (
    <svg
      className={cn("ic", className)}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {inner}
    </svg>
  );
}

export function hasIcon(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}
