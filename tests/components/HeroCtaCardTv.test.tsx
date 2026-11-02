import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import HeroCtaCard, { type HeroCtaCardProps } from "../../components/home/HeroCtaCard";

function props(overrides: Partial<HeroCtaCardProps> = {}): HeroCtaCardProps {
  return {
    hostName: "", customCode: "", joinCode: "", showCustom: false, showJoin: false,
    creating: false, hostError: "", nameInputRef: React.createRef<HTMLInputElement>(),
    onHostNameChange: vi.fn(), onCustomCodeChange: vi.fn(), onJoinCodeChange: vi.fn(),
    onToggleCustom: vi.fn(), onShowJoin: vi.fn(), onHost: vi.fn(), onJoin: vi.fn(),
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
