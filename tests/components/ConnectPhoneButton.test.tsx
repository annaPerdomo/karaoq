import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectPhoneButton } from "../../components/display/ConnectPhoneButton";

describe("ConnectPhoneButton", () => {
  it("stays hidden when not host", () => {
    render(<ConnectPhoneButton isHost={false} onPress={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows when host", () => {
    render(<ConnectPhoneButton isHost={true} onPress={vi.fn()} />);
    expect(screen.getByRole("button", { name: /control the room from your phone/i })).toBeInTheDocument();
  });

  it("hides once isHost flips to false", () => {
    const { rerender } = render(<ConnectPhoneButton isHost={true} onPress={vi.fn()} />);
    expect(screen.getByRole("button", { name: /control the room from your phone/i })).toBeInTheDocument();

    rerender(<ConnectPhoneButton isHost={false} onPress={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /control the room from your phone/i })).not.toBeInTheDocument();
  });
});
