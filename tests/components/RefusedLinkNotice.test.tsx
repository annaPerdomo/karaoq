import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RefusedLinkNotice from "../../components/search/RefusedLinkNotice";
import { en } from "../../lib/i18n/messages";

function renderNotice(over: Partial<React.ComponentProps<typeof RefusedLinkNotice>> = {}) {
  const onQueueOutside = vi.fn();
  render(
    <RefusedLinkNotice
      title="Dancing Queen"
      hasCuts={false}
      canQueueOutside={false}
      onQueueOutside={onQueueOutside}
      {...over}
    />
  );
  return { onQueueOutside };
}

describe("RefusedLinkNotice", () => {
  it("names the refused video", () => {
    renderNotice();
    expect(screen.getByText(/Dancing Queen/)).toBeInTheDocument();
  });

  it("omits the with-cuts line when there are no cuts", () => {
    renderNotice();
    expect(screen.queryByText(en["search.refused.withCuts"])).toBeNull();
  });

  it("shows the with-cuts line when there are cuts", () => {
    renderNotice({ hasCuts: true });
    expect(screen.getByText(en["search.refused.withCuts"])).toBeInTheDocument();
  });

  it("hides queue-anyway unless allowed", () => {
    renderNotice();
    expect(screen.queryByText(en["search.refused.queueAnyway"])).toBeNull();
    expect(screen.queryByText(en["search.refused.queueAnywayHint"])).toBeNull();
  });

  it("calls onQueueOutside from the button and describes it with the hint", () => {
    const { onQueueOutside } = renderNotice({ canQueueOutside: true });
    fireEvent.click(screen.getByText(en["search.refused.queueAnyway"]));
    expect(onQueueOutside).toHaveBeenCalledTimes(1);
    const hint = screen.getByText(en["search.refused.queueAnywayHint"]);
    expect(screen.getByText(en["search.refused.queueAnyway"]).getAttribute("aria-describedby")).toBe(hint.id);
  });
});

describe("RefusedLinkNotice parts", () => {
  it("head shows the title and versions line without the action", () => {
    renderNotice({ hasCuts: true, canQueueOutside: true, part: "head" });
    expect(screen.getByText(/Dancing Queen/)).toBeInTheDocument();
    expect(screen.getByText(en["search.refused.withCuts"])).toBeInTheDocument();
    expect(screen.queryByText(en["search.refused.queueAnyway"])).toBeNull();
  });

  it("action shows only the queue-anyway button and hint", () => {
    renderNotice({ hasCuts: true, canQueueOutside: true, part: "action" });
    expect(screen.queryByText(/Dancing Queen/)).toBeNull();
    expect(screen.queryByText(en["search.refused.withCuts"])).toBeNull();
    expect(screen.getByText(en["search.refused.queueAnyway"])).toBeInTheDocument();
  });
});
