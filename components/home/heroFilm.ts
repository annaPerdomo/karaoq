// Rendered from /demo/hero-video by video/hero-demo/capture.mjs + build.sh;
// regeneration steps in docs/hero-demo-video.md.
export const POSTER = '/demo/hero-demo-poster.webp';
export const WEBM = '/demo/hero-demo.webm';
export const HEVC = '/demo/hero-demo.mp4';

/**
 * Which encode carries alpha *for this browser*. Chromium/Firefox decode alpha
 * in VP9/WebM; WebKit only in HEVC/MP4 (and ignores it in WebM) — picking the
 * wrong one is silent, the film just comes back opaque.
 *
 * A capability probe, not a UA sniff: `userAgentData` exists only in Chromium,
 * the one engine that would otherwise falsely claim `hvc1` support.
 */
export function alphaSource() {
  if (typeof navigator === 'undefined') return WEBM;
  const isChromium = 'userAgentData' in navigator;
  const hevc = document.createElement('video').canPlayType('video/mp4; codecs="hvc1"') !== '';
  return !isChromium && hevc ? HEVC : WEBM;
}

export function prefersReducedData() {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}
