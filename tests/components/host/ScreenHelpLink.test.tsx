import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScreenHelpLink } from "../../../components/host/ScreenHelpLink";

describe("ScreenHelpLink", () => {
  it("renders the English link text and calls onClick", () => {
    const onClick = vi.fn();
    render(<ScreenHelpLink onClick={onClick} />);

    const button = screen.getByText("Need help getting this on a bigger screen?");
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });
});
