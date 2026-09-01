// Sources for the landing hero's alpha film, rendered from /demo/hero-video by
// video/hero-demo/capture.mjs + build.sh. Rationale: docs/hero-demo-video.md.
export const POSTER = '/demo/hero-demo-poster.webp';
export const WEBM = '/demo/hero-demo.webm';
export const HEVC = '/demo/hero-demo.mp4';

/**
 * Which encode carries alpha here: Chromium and Firefox decode it in VP9/WebM,
 * WebKit only in HEVC/MP4.
 *
 * HEVC needs an Apple *platform*, not just WebKit. Every WebKit port hardcodes
 * `navigator.vendor` to Apple — PS4/PS5, WPE and WebKitGTK set-tops, webOS ≤ 3,
 * Tizen 2 — and those accept HEVC in hardware, then discard its alpha layer.
 */
export function alphaSource() {
  if (typeof navigator === 'undefined') return WEBM;
  const isApple =
    navigator.vendor === 'Apple Computer, Inc.' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const hevc = document.createElement('video').canPlayType('video/mp4; codecs="hvc1"') !== '';
  return isApple && hevc ? HEVC : WEBM;
}

/**
 * Corners: all four read alpha 0 across all 600 captured frames — the canvas
 * feathers its outermost 1.2%/1.5% (`.stage` in styles/HeroVideo.module.css)
 * and no device enters it.
 *
 * Witness: the big screen's centre, which never moves and never paints black.
 * Some embedded GPUs keep video in an overlay and hand `drawImage` an all-black
 * surface — at the corners that is byte-identical to a dropped alpha plane.
 */
const CORNER_INSET = 0.02;
const WITNESS = [337 / 1200, 279 / 770];
/** A dropped alpha plane comes back at exactly 255; real alpha stays near 0. */
const OPAQUE_ALPHA = 128;

/**
 * Fails open: no 2D context, a tainted canvas, no frame yet, or a readback that
 * comes back uniformly black all report success, because trading a working film
 * for a still is the worse regression.
 */
export function decodedWithAlpha(video: HTMLVideoElement) {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return true;
  const dx = Math.round(w * CORNER_INSET);
  const dy = Math.round(h * CORNER_INSET);
  const corners = [
    [dx, dy],
    [w - 1 - dx, dy],
    [dx, h - 1 - dy],
    [w - 1 - dx, h - 1 - dy],
  ];
  const points = [...corners, [Math.round(w * WITNESS[0]), Math.round(h * WITNESS[1])]];
  const canvas = document.createElement('canvas');
  canvas.width = points.length;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  try {
    points.forEach(([x, y], i) => ctx.drawImage(video, x, y, 1, 1, i, 0, 1, 1));
    const { data } = ctx.getImageData(0, 0, points.length, 1);
    const rgbSum = (i: number) => data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2];
    if (rgbSum(corners.length) === 0) return true;
    return corners.some((_, i) => data[i * 4 + 3] < OPAQUE_ALPHA);
  } catch {
    return true;
  }
}

/**
 * `?film=webm|mp4|poster` — a diagnostic for TV browsers, which have no devtools
 * and no console. `null` forces the poster; `undefined` means no override.
 */
export function forcedSource(): string | null | undefined {
  if (typeof window === 'undefined') return undefined;
  switch (new URLSearchParams(window.location.search).get('film')) {
    case 'webm':
      return WEBM;
    case 'mp4':
      return HEVC;
    case 'poster':
      return null;
    default:
      return undefined;
  }
}

export function prefersReducedData() {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}
