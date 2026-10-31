import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";

import MusicVideoLockup from "../../components/musicvideo/MusicVideoLockup";

describe("MusicVideoLockup", () => {
  it("credits KaraoQ when the room has no logo", () => {
    const { container } = render(<MusicVideoLockup joinCode="ROOM1" logo={undefined} />);
    expect(screen.getByText("KaraoQ")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the club logo apart from the KaraoQ credit", () => {
    const { container } = render(<MusicVideoLockup joinCode="ROOM1" logo="0123456789abcdef" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("0123456789abcdef");
    expect(screen.getByText("KaraoQ").parentElement!.contains(img)).toBe(false);
  });
});
