import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SingErrorCard from "../../components/sing/SingErrorCard";
import { en } from "../../lib/i18n/messages";

describe("SingErrorCard", () => {
  it("shows the host-your-own link on the not-found variant", () => {
    render(
      <SingErrorCard
        variant="notFound"
        message={en["sing.error.notFound"]}
        onGoHome={vi.fn()}
      />
    );

    const link = screen.getByText(en["sing.error.hostOwn"]);
    expect(link.closest("a")).toHaveAttribute("href", "/?ref=room-ended");
  });

  it("does not show the host-your-own link on the connection-error variant", () => {
    render(<SingErrorCard variant="connection" onRetry={vi.fn()} />);

    expect(screen.queryByText(en["sing.error.hostOwn"])).toBeNull();
  });
});
