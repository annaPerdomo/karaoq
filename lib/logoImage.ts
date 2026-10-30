import { LOGO_MAX_BYTES } from "./limits";

export const LOGO_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const LOGO_MAX_PX = 384;
// Below this the logo is unreadable on a TV; give up and report "size".
const LOGO_MIN_PX = 16;
const WEBP_QUALITIES = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

/** Decoded size of a base64 data URL — what the server's LOGO_MAX_BYTES checks. */
function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function encodeAt(bitmap: ImageBitmap, w: number, h: number): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  for (const q of WEBP_QUALITIES) {
    const url = canvas.toDataURL("image/webp", q);
    if (dataUrlBytes(url) <= LOGO_MAX_BYTES) return url;
    // No WebP encoder (PNG came back): only a smaller canvas can help.
    if (!url.startsWith("data:image/webp")) return null;
  }
  return null;
}

/** Re-encodes a picked file as a data URL under LOGO_MAX_BYTES. Throws
 *  Error("type") for non-raster input, Error("size") when nothing fits. */
export async function prepareLogo(file: File): Promise<string> {
  if (file.type === "image/svg+xml" || !file.type.startsWith("image/")) {
    throw new Error("type");
  }
  if (file.size > LOGO_MAX_INPUT_BYTES) throw new Error("size");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("type");
  }
  try {
    const fit = Math.min(1, LOGO_MAX_PX / Math.max(bitmap.width, bitmap.height));
    let w = Math.max(1, Math.round(bitmap.width * fit));
    let h = Math.max(1, Math.round(bitmap.height * fit));
    for (;;) {
      const url = encodeAt(bitmap, w, h);
      if (url) return url;
      if (Math.max(w, h) / 2 < LOGO_MIN_PX) throw new Error("size");
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
    }
  } finally {
    bitmap.close?.();
  }
}
