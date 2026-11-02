import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SingFooter from "../../components/sing/SingFooter";
import { en } from "../../lib/i18n/messages";

describe("SingFooter", () => {
  it("renders the host-your-own link", () => {
    render(<SingFooter roomId="ABCD" queue={[]} activeVideoIndex={0} />);

    const link = screen.getByText(en["sing.hostOwn"]);
    expect(link.closest("a")).toHaveAttribute("href", "/?ref=guest-sing");
  });
});
