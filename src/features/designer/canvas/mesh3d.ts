/**
 * Dependency-free 3D projector for the generated solid.
 *
 * Projects a real {@link BracketMesh} (board-space millimetres, Z up) to flat-shaded,
 * back-to-front-sorted 2D polygons for an SVG preview. Orthographic, deterministic, and
 * pure — no WebGL, no libraries — so the preview shows the ACTUAL generated geometry the
 * exporters serialise, not an illustration. Backface culling + centroid-depth painter's
 * ordering give a good opaque approximation; because the multi-body solid interpenetrates
 * (standoffs sink into the plate), average-depth sorting is not exact at grazing angles,
 * so occasional facet-ordering artifacts are possible. It is a preview, not a raytrace.
 */
import type { BracketMesh, Vec3 } from "@/core/geometry/mesh";

export interface OrbitCamera {
  /** Azimuth around the world Z (up) axis, radians. */
  yaw: number;
  /** Elevation above the ground plane, radians. */
  pitch: number;
}

export type ViewId = "iso" | "top" | "front" | "fit";

export const VIEW_PRESETS: Record<ViewId, OrbitCamera> = {
  iso: { yaw: -0.7, pitch: 0.62 },
  top: { yaw: 0, pitch: 1.5707 },
  front: { yaw: 0, pitch: 0.06 },
  fit: { yaw: -0.55, pitch: 0.5 },
};

export interface Face2D {
  points: string;
  fill: string;
}

export interface MeshProjection {
  faces: Face2D[];
  viewBox: string;
  width: number;
  height: number;
}

export interface ProjectOptions {
  width: number;
  height: number;
  padding?: number;
  /** Base solid colour (sRGB 0–255). */
  baseColor?: [number, number, number];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Camera basis from spherical angles: `dir` points from the model toward the camera. */
function cameraBasis(cam: OrbitCamera): { dir: Vec3; right: Vec3; up: Vec3 } {
  const cp = Math.cos(cam.pitch);
  const dir = normalize([cp * Math.cos(cam.yaw), cp * Math.sin(cam.yaw), Math.sin(cam.pitch)]);
  const worldUp: Vec3 = Math.abs(dir[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize(cross(worldUp, dir));
  const up = cross(dir, right);
  return { dir, right, up };
}

export function projectMesh(mesh: BracketMesh, cam: OrbitCamera, opts: ProjectOptions): MeshProjection {
  const { width, height } = opts;
  const pad = opts.padding ?? 28;
  const base = opts.baseColor ?? [104, 148, 205];
  const { dir, right, up } = cameraBasis(cam);

  const c: Vec3 = [
    (mesh.bbox.min[0] + mesh.bbox.max[0]) / 2,
    (mesh.bbox.min[1] + mesh.bbox.max[1]) / 2,
    (mesh.bbox.min[2] + mesh.bbox.max[2]) / 2,
  ];

  const pos = mesh.positions;
  const n = pos.length / 3;
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const dz = new Float64Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const q: Vec3 = [pos[i * 3] - c[0], pos[i * 3 + 1] - c[1], pos[i * 3 + 2] - c[2]];
    const x = dot(q, right);
    const y = dot(q, up);
    sx[i] = x;
    sy[i] = y;
    dz[i] = dot(q, dir);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const screenX = (i: number) => (sx[i] - minX) * scale + offX;
  const screenY = (i: number) => (maxY - sy[i]) * scale + offY; // flip: world-up → screen-up

  const light = normalize([dir[0] * 0.6 + 0.15, dir[1] * 0.6 - 0.2, dir[2] * 0.6 + 0.5]);
  const idx = mesh.indices;
  const faces: { depth: number; face: Face2D }[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const cI = idx[t + 2];
    const wa: Vec3 = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const wb: Vec3 = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
    const wc: Vec3 = [pos[cI * 3], pos[cI * 3 + 1], pos[cI * 3 + 2]];
    const nw = normalize(cross([wb[0] - wa[0], wb[1] - wa[1], wb[2] - wa[2]], [wc[0] - wa[0], wc[1] - wa[1], wc[2] - wa[2]]));
    if (dot(nw, dir) <= 0) continue; // backface cull
    const lit = Math.max(0, dot(nw, light));
    const top = Math.max(0, nw[2]);
    const shade = Math.min(1, 0.32 + 0.55 * lit + 0.18 * top);
    const fill = `rgb(${Math.round(base[0] * shade)},${Math.round(base[1] * shade)},${Math.round(base[2] * shade)})`;
    const points = `${screenX(a).toFixed(2)},${screenY(a).toFixed(2)} ${screenX(b).toFixed(2)},${screenY(b).toFixed(2)} ${screenX(cI).toFixed(2)},${screenY(cI).toFixed(2)}`;
    faces.push({ depth: (dz[a] + dz[b] + dz[cI]) / 3, face: { points, fill } });
  }
  faces.sort((p, q) => p.depth - q.depth); // far → near (painter's)

  return { faces: faces.map((f) => f.face), viewBox: `0 0 ${width} ${height}`, width, height };
}
