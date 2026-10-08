import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { HostGate } from "../../components/host/HostGate";
import { notifyRoomKeyRejected, setRoomKey } from "../../lib/roomKeyStore";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { joinCode: "abcde" } }),
}));

const getRoomMock = vi.fn();
vi.mock("../../app/queue/getRoom", () => ({
  default: (...args: unknown[]) => getRoomMock(...args),
}));

function Body({ onMount }: { onMount: () => void }) {
  React.useEffect(onMount, [onMount]);
  return <div data-testid="body-mounted" />;
}

describe("HostGate", () => {
  beforeEach(() => {
    localStorage.clear();
    getRoomMock.mockReset();
  });

  it("mounts body when the room doesn't exist yet", async () => {
    getRoomMock.mockResolvedValue("notFound");
    const onMount = vi.fn();
    render(<HostGate remote={false} body={<Body onMount={onMount} />} />);

    await waitFor(() => expect(screen.queryByTestId("body-mounted")).toBeInTheDocument());
    expect(onMount).toHaveBeenCalled();
  });

  it("mounts body for a legacy (unkeyed) room", async () => {
    getRoomMock.mockResolvedValue({ id: "ABCDE", keyed: false });
    const onMount = vi.fn();
    render(<HostGate remote={false} body={<Body onMount={onMount} />} />);

    await waitFor(() => expect(screen.queryByTestId("body-mounted")).toBeInTheDocument());
    expect(onMount).toHaveBeenCalled();
  });

  it("never mounts body for a keyed room with no stored key", async () => {
    getRoomMock.mockResolvedValue({ id: "ABCDE", keyed: true });
    const onMount = vi.fn();
    render(<HostGate remote={false} body={<Body onMount={onMount} />} />);

    await waitFor(() =>
      expect(screen.getByText("This room is run from another device")).toBeInTheDocument()
    );
    expect(onMount).not.toHaveBeenCalled();
    expect(screen.queryByTestId("body-mounted")).not.toBeInTheDocument();
  });

  it("mounts body for a keyed room when this device holds the host key", async () => {
    setRoomKey("ABCDE", "host-key", "host");
    getRoomMock.mockResolvedValue({ id: "ABCDE", keyed: true });
    const onMount = vi.fn();
    render(<HostGate remote={false} body={<Body onMount={onMount} />} />);

    await waitFor(() => expect(screen.queryByTestId("body-mounted")).toBeInTheDocument());
    expect(onMount).toHaveBeenCalled();
  });

  it("unmounts body and shows the notice when its key is rejected mid-session", async () => {
    setRoomKey("ABCDE", "host-key", "host");
    getRoomMock.mockResolvedValue({ id: "ABCDE", keyed: true });
    const onMount = vi.fn();
    render(<HostGate remote={false} body={<Body onMount={onMount} />} />);

    await waitFor(() => expect(screen.queryByTestId("body-mounted")).toBeInTheDocument());

    notifyRoomKeyRejected("ABCDE");

    await waitFor(() =>
      expect(screen.getByText("This room is run from another device")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("body-mounted")).not.toBeInTheDocument();
  });
});
