import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecapShareButton from "../../components/RecapShareButton";
import { QueueEntry } from "../../pages/api/types";
import { en } from "../../lib/i18n/messages";

let seq = 0;
function entry(userName: string): QueueEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    userName,
    songTitle: `Song ${seq}`,
    videoId: "dQw4w9WgXcQ",
    addedAt: Date.now(),
  };
}

function stubShare(share?: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
    writable: true,
  });
}

function stubClipboard(writeText?: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  stubShare(undefined);
  stubClipboard(undefined);
});

describe("RecapShareButton", () => {
  it("renders nothing under 3 played songs", () => {
    const queue = [entry("Ana"), entry("Bo")];
    const { container } = render(
      <RecapShareButton queue={queue} activeVideoIndex={queue.length} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("uses navigator.share when available", async () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const share = vi.fn(async () => {});
    stubShare(share);

    render(<RecapShareButton queue={queue} activeVideoIndex={queue.length} />);
    fireEvent.click(screen.getByText(en["recap.share"]));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const call = share.mock.calls[0][0];
    expect(call.url).toContain("ref=recap");
  });

  it("falls back to clipboard and shows the copied label", async () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);

    render(<RecapShareButton queue={queue} activeVideoIndex={queue.length} />);
    fireEvent.click(screen.getByText(en["recap.share"]));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(en["recap.copied"])).toBeInTheDocument();
  });

  it("does nothing further when the share sheet is dismissed (AbortError)", async () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const share = vi.fn(async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    const writeText = vi.fn(async () => {});
    stubShare(share);
    stubClipboard(writeText);

    render(<RecapShareButton queue={queue} activeVideoIndex={queue.length} />);
    fireEvent.click(screen.getByText(en["recap.share"]));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText(en["recap.copied"])).toBeNull();
  });

  it("falls back to clipboard when the share call rejects for any other reason", async () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];
    const share = vi.fn(async () => {
      throw Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    });
    const writeText = vi.fn(async () => {});
    stubShare(share);
    stubClipboard(writeText);

    render(<RecapShareButton queue={queue} activeVideoIndex={queue.length} />);
    fireEvent.click(screen.getByText(en["recap.share"]));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(en["recap.copied"])).toBeInTheDocument();
  });

  it("does not throw when both share and clipboard are unavailable", async () => {
    const queue = [entry("Ana"), entry("Bo"), entry("Cat")];

    render(<RecapShareButton queue={queue} activeVideoIndex={queue.length} />);
    fireEvent.click(screen.getByText(en["recap.share"]));

    await waitFor(() => expect(screen.getByText(en["recap.share"])).toBeInTheDocument());
  });
});
