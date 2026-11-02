// 1080p renders at 1.2×. A 1280×720 design (1.5×) read as zoomed-in from the
// couch on a real set.
export const TV_DESIGN_W = 1600;
export const TV_DESIGN_H = 900;

// The floor still has to fit a 960×540 set, which some Tizen models report.
export const TV_SCALE_MIN = 0.6;
export const TV_SCALE_MAX = 3;

// The sidebar keeps its 1.5×-at-1080p size: the QR has to scan from across the
// room and the queue is already the smallest text on screen.
export const TV_SIDEBAR_BOOST = 1.25;

export function tvScale(viewportW: number, viewportH: number): number {
  if (!Number.isFinite(viewportW) || !Number.isFinite(viewportH) || viewportW <= 0 || viewportH <= 0) {
    return 1;
  }
  const raw = Math.min(viewportW / TV_DESIGN_W, viewportH / TV_DESIGN_H);
  const clamped = Math.min(TV_SCALE_MAX, Math.max(TV_SCALE_MIN, raw));
  return Math.round(clamped * 1000) / 1000;
}
