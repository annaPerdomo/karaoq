import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LOGO_MAX_INPUT_BYTES, LOGO_MAX_PX, prepareLogo } from "../../lib/logoImage";
import { LOGO_MAX_BYTES } from "../../lib/limits";

function fileOf(type: string, bytes = 10): File {
  const f = new File([new Uint8Array(1)], "logo", { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

// A data URL whose decoded payload is `bytes` long.
function dataUrl(mime: string, bytes: number): string {
  return `data:${mime};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;
}

let sizes: { w: number; h: number }[];
let encode: (mime: string, q: number | undefined, w: number) => string;

beforeEach(() => {
  sizes = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1000, height: 500, close: vi.fn() }))
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    sizes.push({ w: this.width, h: this.height });
    return { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
    this: HTMLCanvasElement,
    mime?: string,
    q?: number
  ) {
    return encode(mime ?? "image/png", q, this.width);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareLogo", () => {
  it("rejects SVG as a type error", async () => {
    await expect(prepareLogo(fileOf("image/svg+xml"))).rejects.toThrow("type");
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("rejects non-images as a type error", async () => {
    await expect(prepareLogo(fileOf("application/pdf"))).rejects.toThrow("type");
    await expect(prepareLogo(fileOf(""))).rejects.toThrow("type");
  });

  it("rejects input over the 5 MB cap before decoding", async () => {
    await expect(
      prepareLogo(fileOf("image/png", LOGO_MAX_INPUT_BYTES + 1))
    ).rejects.toThrow("size");
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("treats an undecodable image as a type error", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad"))));
    await expect(prepareLogo(fileOf("image/png"))).rejects.toThrow("type");
  });

  it("fits inside 384px and steps WebP quality down until it fits", async () => {
    const qualities: number[] = [];
    encode = (mime, q) => {
      qualities.push(q!);
      return dataUrl("image/webp", q! > 0.7 ? LOGO_MAX_BYTES + 1 : 1000);
    };
    const url = await prepareLogo(fileOf("image/png"));
    expect(url.startsWith("data:image/webp")).toBe(true);
    expect(sizes[0]).toEqual({ w: LOGO_MAX_PX, h: LOGO_MAX_PX / 2 });
    expect(qualities[0]).toBe(0.85);
    expect(qualities[qualities.length - 1]).toBeCloseTo(0.7);
  });

  it("never upscales a small image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 40 })));
    encode = () => dataUrl("image/webp", 500);
    await prepareLogo(fileOf("image/jpeg"));
    expect(sizes[0]).toEqual({ w: 100, h: 40 });
  });

  it("halves the dimensions when the browser only encodes PNG", async () => {
    encode = (_mime, _q, w) => dataUrl("image/png", w > 100 ? LOGO_MAX_BYTES + 1 : 2000);
    const url = await prepareLogo(fileOf("image/png"));
    expect(url.startsWith("data:image/png")).toBe(true);
    expect(sizes.map((s) => s.w)).toEqual([384, 192, 96]);
  });

  it("throws size only when nothing fits", async () => {
    encode = () => dataUrl("image/png", LOGO_MAX_BYTES + 1);
    await expect(prepareLogo(fileOf("image/png"))).rejects.toThrow("size");
  });
});
