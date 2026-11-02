import { describe, it, expect, vi, afterEach } from "vitest";
import { copyLinkOrShow } from "../../components/host/clipboard";

describe("copyLinkOrShow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the copied message on a successful write", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const showToast = vi.fn();

    copyLinkOrShow("https://karaoq.live/x", showToast, "Copied");
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("https://karaoq.live/x");
    expect(showToast).toHaveBeenCalledWith("Copied");
  });

  it("falls back to showing the url when the write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const showToast = vi.fn();

    copyLinkOrShow("https://karaoq.live/x", showToast, "Copied");
    await Promise.resolve();
    await Promise.resolve();

    expect(showToast).toHaveBeenCalledWith("https://karaoq.live/x");
  });

  it("falls back to showing the url, synchronously and without throwing, when navigator.clipboard is undefined", () => {
    vi.stubGlobal("navigator", {});
    const showToast = vi.fn();

    expect(() => copyLinkOrShow("https://karaoq.live/x", showToast, "Copied")).not.toThrow();
    expect(showToast).toHaveBeenCalledWith("https://karaoq.live/x");
  });

  it("lets a caller's next line run even when navigator.clipboard is undefined", () => {
    vi.stubGlobal("navigator", {});
    const showToast = vi.fn();
    const after = vi.fn();

    copyLinkOrShow("https://karaoq.live/x", showToast, "Copied");
    after();

    expect(after).toHaveBeenCalledOnce();
  });
});
