import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConfirmModal from "../../components/songsearch/ConfirmModal";
import { en } from "../../lib/i18n/messages";

function renderModal(external: boolean) {
  const { container } = render(
    <ConfirmModal
      song={{ title: "Song", thumbnailUrl: "t", videoId: "dQw4w9WgXcQ", ...(external ? { external: true as const } : {}) }}
      previewPlaying={false}
      onPlayPreview={vi.fn()}
      pickMode={false}
      userName="Anna"
      adding={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  return container;
}

describe("ConfirmModal", () => {
  it("links an external song's thumbnail out to YouTube instead of embedding it", () => {
    const container = renderModal(true);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText(en["search.refused.confirmNote"])).toBeInTheDocument();
  });

  it("keeps the in-app preview for a normal song", () => {
    const container = renderModal(false);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByText(en["search.refused.confirmNote"])).toBeNull();
  });
});
