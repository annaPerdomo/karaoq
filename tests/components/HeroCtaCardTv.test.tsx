import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import HeroCtaCard, { type HeroCtaCardProps } from "../../components/home/HeroCtaCard";

function props(overrides: Partial<HeroCtaCardProps> = {}): HeroCtaCardProps {
  return {
    hostName: "", customCode: "", joinCode: "", showCustom: false, showJoin: false,
    showConnectTv: false, creating: false, hostError: "",
    nameInputRef: React.createRef<HTMLInputElement>(),
    onHostNameChange: vi.fn(), onCustomCodeChange: vi.fn(), onJoinCodeChange: vi.fn(),
    onToggleCustom: vi.fn(), onShowJoin: vi.fn(), onShowConnectTv: vi.fn(),
    onConnectTvNeedsRoom: vi.fn(async () => null), onConnectTvPaired: vi.fn(),
    onHost: vi.fn(), onJoin: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-tv");
});

describe("HeroCtaCard on a TV", () => {
  it("shows the full form off a TV", () => {
    render(<HeroCtaCard {...props()} />);
    expect(screen.getByRole("textbox", { name: /your name/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /type a name instead/i })).not.toBeInTheDocument();
  });

  it("folds the form behind a link on a TV and unfolds it on press", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(<HeroCtaCard {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: /type a name instead/i }));
    expect(screen.getByRole("textbox", { name: /your name/i })).toBeInTheDocument();
  });

  it("unfolds when the header's Join CTA opens the join row", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(<HeroCtaCard {...props({ showJoin: true })} />);
    expect(await screen.findByRole("textbox", { name: /room code/i })).toBeInTheDocument();
  });
});

describe("HeroCtaCard Connect a TV row", () => {
  it("offers Connect a TV under Start a Room on a phone", () => {
    const onShowConnectTv = vi.fn();
    render(<HeroCtaCard {...props({ onShowConnectTv })} />);
    fireEvent.click(screen.getByRole("button", { name: /open on your tv/i }));
    expect(onShowConnectTv).toHaveBeenCalled();
  });

  it("swaps the row for the pairing code input when open", () => {
    render(<HeroCtaCard {...props({ showConnectTv: true })} />);
    expect(screen.getByRole("textbox", { name: /^connect$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open on your tv/i })).not.toBeInTheDocument();
  });

  it("hides the row on a TV, which shows its own code", async () => {
    document.documentElement.setAttribute("data-tv", "1");
    render(<HeroCtaCard {...props({ showJoin: true })} />);
    await screen.findByRole("textbox", { name: /room code/i });
    expect(screen.queryByRole("button", { name: /open on your tv/i })).not.toBeInTheDocument();
  });
});
