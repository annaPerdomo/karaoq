import { describe, it, expect } from "vitest";
import {
  displayBlocks,
  hostBlocks,
} from "../../components/analytics/LayoutPreview";
import {
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_HOST_CONFIG,
} from "../../pages/api/types";

// The wireframe is only worth reading if a section appears in it exactly when
// it appears on the real screen, so these assert the same visibility rules the
// sidebars use — text-driven banner, flag-driven toggles, queue never hidden.

describe("displayBlocks", () => {
  it("follows the saved sidebar order", () => {
    const { blocks } = displayBlocks({
      ...DEFAULT_DISPLAY_CONFIG,
      bannerLine: "Karaoke Tuesdays",
      sidebarOrder: ["upNext", "boards", "banner", "qr"],
    });
    expect(blocks.map((b) => b.key)).toEqual([
      "upNext",
      "boards",
      "banner",
      "qr",
    ]);
  });

  it("hides the QR when the card is switched off", () => {
    const { blocks, hidden } = displayBlocks({
      ...DEFAULT_DISPLAY_CONFIG,
      qrSize: "hidden",
    });
    expect(blocks.some((b) => b.key === "qr")).toBe(false);
    expect(hidden).toContain("QR");
  });

  // The banner has no on/off switch — it exists exactly when it has text.
  it("hides an empty banner and shows one with text", () => {
    expect(displayBlocks(DEFAULT_DISPLAY_CONFIG).hidden).toContain("Banner");

    const { blocks } = displayBlocks({
      ...DEFAULT_DISPLAY_CONFIG,
      bannerLine: "Happy 30th, Sam!",
    });
    expect(blocks.find((b) => b.key === "banner")?.label).toContain(
      "Happy 30th, Sam!"
    );
  });

  it("truncates a long banner so it can't stretch the wireframe", () => {
    const { blocks } = displayBlocks({
      ...DEFAULT_DISPLAY_CONFIG,
      bannerLine: "x".repeat(80),
    });
    const label = blocks.find((b) => b.key === "banner")?.label ?? "";
    expect(label).toContain("…");
    expect(label.length).toBeLessThan(40);
  });

  it("hides the up-next list when it's switched off", () => {
    const { blocks, hidden } = displayBlocks({
      ...DEFAULT_DISPLAY_CONFIG,
      showUpNext: false,
    });
    expect(blocks.some((b) => b.key === "upNext")).toBe(false);
    expect(hidden).toContain("Up next");
  });

  it("lets the up-next list take the leftover height", () => {
    const { blocks } = displayBlocks(DEFAULT_DISPLAY_CONFIG);
    expect(blocks.find((b) => b.key === "upNext")?.grow).toBe(true);
  });

  // Boards visibility is a room flag outside DisplayConfig, so the slot is
  // always drawn rather than guessed at from a config that can't know.
  it("always draws the boards slot", () => {
    const { blocks, hidden } = displayBlocks(DEFAULT_DISPLAY_CONFIG);
    expect(blocks.some((b) => b.key === "boards")).toBe(true);
    expect(hidden).not.toContain("Boards");
  });
});

describe("hostBlocks", () => {
  it("follows the saved section order", () => {
    const { blocks } = hostBlocks({
      ...DEFAULT_HOST_CONFIG,
      bannerLine: "Last call 1am",
      sectionOrder: ["qr", "banner", "boards", "queue"],
    });
    expect(blocks.map((b) => b.key)).toEqual([
      "qr",
      "banner",
      "boards",
      "queue",
    ]);
  });

  // Without the queue there's no host page, so it can be moved but never hidden.
  it("never hides the queue, and gives it the leftover height", () => {
    const { blocks, hidden } = hostBlocks(DEFAULT_HOST_CONFIG);
    expect(blocks.find((b) => b.key === "queue")?.grow).toBe(true);
    expect(hidden).not.toContain("Queue");
  });

  it("hides the boards roll-up and QR shelf when switched off", () => {
    const { blocks, hidden } = hostBlocks({
      ...DEFAULT_HOST_CONFIG,
      showBoards: false,
      showQr: false,
    });
    expect(blocks.map((b) => b.key)).toEqual(["queue"]);
    expect(hidden).toEqual(expect.arrayContaining(["Boards", "QR shelf"]));
  });

  it("shows the banner only once it has text", () => {
    expect(hostBlocks(DEFAULT_HOST_CONFIG).hidden).toContain("Banner");
    const { blocks } = hostBlocks({
      ...DEFAULT_HOST_CONFIG,
      bannerLine: "Last call 1am",
    });
    expect(blocks.find((b) => b.key === "banner")?.label).toContain(
      "Last call 1am"
    );
  });
});
