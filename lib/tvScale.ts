export const TV_DESIGN_W = 1280;
export const TV_DESIGN_H = 720;

const TV_SCALE_MIN = 0.75;
const TV_SCALE_MAX = 3;

export function tvScale(viewportW: number, viewportH: number): number {
  if (!Number.isFinite(viewportW) || !Number.isFinite(viewportH) || viewportW <= 0 || viewportH <= 0) {
    return 1;
  }
  const raw = Math.min(viewportW / TV_DESIGN_W, viewportH / TV_DESIGN_H);
  const clamped = Math.min(TV_SCALE_MAX, Math.max(TV_SCALE_MIN, raw));
  return Math.round(clamped * 1000) / 1000;
}
