import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConnectPhoneButton } from "../../components/display/ConnectPhoneButton";
import { setRoomKey } from "../../lib/roomKeyStore";

beforeEach(() => {
  localStorage.clear();
});

describe("ConnectPhoneButton", () => {
  it("stays hidden without a stored key", async () => {
    render(<ConnectPhoneButton joinCode="ROOM1" onPress={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  it("stays hidden for a display key", async () => {
    setRoomKey("ROOM1", "k", "display");
    render(<ConnectPhoneButton joinCode="ROOM1" onPress={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  it("stays hidden for a cohost key", async () => {
    setRoomKey("ROOM1", "k", "cohost");
    render(<ConnectPhoneButton joinCode="ROOM1" onPress={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  it("shows for a host key", async () => {
    setRoomKey("ROOM1", "k", "host");
    render(<ConnectPhoneButton joinCode="ROOM1" onPress={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /connect a phone/i })).toBeInTheDocument();
  });
});
