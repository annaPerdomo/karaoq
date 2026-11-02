import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveBrand, uploadLogo } from "../../app/queue/brand";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("uploadLogo", () => {
  it("posts the data URL and returns hash + url", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ hash: "h", url: "/u" }) });
    await expect(uploadLogo("ROOM1", "data:image/webp;base64,AA")).resolves.toEqual({ hash: "h", url: "/u" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/queue/ROOM1/logo");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ dataUrl: "data:image/webp;base64,AA" });
  });

  it("maps a 507 to full and anything else to upload", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 507 });
    await expect(uploadLogo("ROOM1", "x")).rejects.toThrow("full");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 413 });
    await expect(uploadLogo("ROOM1", "x")).rejects.toThrow("upload");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(uploadLogo("ROOM1", "x")).rejects.toThrow("upload");
  });
});

describe("saveBrand", () => {
  it("sends brand + surface and returns the saved brand", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ brand: { accentA: "#000000" } }) });
    await expect(saveBrand("ROOM1", { accentA: "#000000" }, "host")).resolves.toEqual({ accentA: "#000000" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ brand: { accentA: "#000000" }, surface: "host" });
  });
});
