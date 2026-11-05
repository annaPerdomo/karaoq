import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WelcomeOverlay from "../../components/sing/WelcomeOverlay";
import CheerBar from "../../components/CheerBar";
import QrJoinCard from "../../components/QrJoinCard";
import { en } from "../../lib/i18n/messages";

describe("WelcomeOverlay", () => {
  it("tells every guest about cheering before they're in", () => {
    render(<WelcomeOverlay joinCode="ABCD" onSubmit={vi.fn()} onSkip={vi.fn()} />);
    // The emoji are joined by no-break spaces; Testing Library collapses those in the DOM text.
    expect(screen.getByText(en["sing.welcome.cheerTip"].replace(/\s+/g, " "))).toBeInTheDocument();
  });

  it("opens on the singer so the first tap can be a cheer, then lets the room through", () => {
    vi.useFakeTimers();
    try {
      const onCheer = vi.fn();
      const onSkip = vi.fn();
      const { rerender } = render(
        <WelcomeOverlay
          joinCode="ABCD"
          onSubmit={vi.fn()}
          onSkip={onSkip}
          onStage={{ userName: "Anna", songTitle: "Neon Hearts" }}
          onCheer={onCheer}
          lastSentEmoji={null}
        />
      );
      expect(screen.getByText("Anna is on stage")).toBeInTheDocument();
      expect(screen.getByText(en["sing.welcome.singToo"])).toBeInTheDocument();
      expect(screen.getByText(en["sing.welcome.cheerNow"])).toBeInTheDocument();
      // No name typed, the cheer still goes.
      fireEvent.click(screen.getByRole("button", { name: "Send 🔥 cheer" }));
      expect(onCheer).toHaveBeenCalledWith("🔥");
      rerender(
        <WelcomeOverlay
          joinCode="ABCD"
          onSubmit={vi.fn()}
          onSkip={onSkip}
          onStage={{ userName: "Anna", songTitle: "Neon Hearts" }}
          onCheer={onCheer}
          lastSentEmoji="🔥"
        />
      );
      expect(screen.getByText("🔥 Sent!")).toBeInTheDocument();
      expect(onSkip).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1500);
      expect(onSkip).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays open when a cheerer starts typing a name", () => {
    vi.useFakeTimers();
    try {
      const onSkip = vi.fn();
      render(
        <WelcomeOverlay
          joinCode="ABCD"
          onSubmit={vi.fn()}
          onSkip={onSkip}
          onStage={{ userName: "Anna", songTitle: "Neon Hearts" }}
          onCheer={vi.fn()}
          lastSentEmoji={null}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "Send 🔥 cheer" }));
      fireEvent.change(screen.getByPlaceholderText(en["common.enterYourName"]), { target: { value: "M" } });
      vi.advanceTimersByTime(3000);
      expect(onSkip).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the plain name prompt when nobody's singing", () => {
    render(<WelcomeOverlay joinCode="ABCD" onSubmit={vi.fn()} onSkip={vi.fn()} onCheer={vi.fn()} />);
    expect(screen.getByText(en["sing.welcome.prompt"])).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send 🔥 cheer" })).toBeNull();
  });

  it("lets a guest in without a name", () => {
    const onSkip = vi.fn();
    render(<WelcomeOverlay joinCode="ABCD" onSubmit={vi.fn()} onSkip={onSkip} />);
    expect(screen.getByText(en["sing.welcome.go"])).toBeDisabled();
    fireEvent.click(screen.getByText(en["sing.welcome.skip"]));
    expect(onSkip).toHaveBeenCalled();
  });
});

describe("CheerBar", () => {
  it("sends every tap — no cooldown", () => {
    const onReaction = vi.fn();
    render(<CheerBar onReaction={onReaction} lastSentEmoji={null} />);
    const fire = screen.getByRole("button", { name: "🔥" });
    fireEvent.click(fire);
    fireEvent.click(fire);
    fireEvent.click(fire);
    expect(onReaction).toHaveBeenCalledTimes(3);
    expect(fire).not.toBeDisabled();
  });

  it("glows only while nudging", () => {
    const { container, rerender } = render(<CheerBar onReaction={vi.fn()} lastSentEmoji={null} nudge />);
    expect(container.firstElementChild!.className).toMatch(/cheerBarNudge/);
    rerender(<CheerBar onReaction={vi.fn()} lastSentEmoji={null} />);
    expect(container.firstElementChild!.className).not.toMatch(/cheerBarNudge/);
  });
});

describe("QrJoinCard", () => {
  const base = { joinUrl: "https://karaoq.live/sing/ABCD?via=qr", joinCode: "ABCD", origin: "https://karaoq.live" };

  it("always offers both verbs, with the cheer line idle between songs", () => {
    render(<QrJoinCard {...base} />);
    expect(screen.getByText(en["qr.addSong"])).toBeInTheDocument();
    expect(screen.getByText(en["qr.cheerIdle"])).toBeInTheDocument();
    expect(screen.getByText("karaoq.live")).toBeInTheDocument();
    expect(screen.getByText("ABCD")).toBeInTheDocument();
  });

  it("names the singer on the cheer line without dropping add-a-song", () => {
    render(<QrJoinCard {...base} cheerFor="Anna" />);
    expect(screen.getByText("Cheer Anna on!")).toBeInTheDocument();
    expect(screen.getByText(en["qr.addSong"])).toBeInTheDocument();
    expect(screen.queryByText(en["qr.cheerIdle"])).toBeNull();
  });
});
