import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render } from "@testing-library/react";
import { useCohostKeyFromFragment } from "../../components/host/hooks/useCohostKeyFromFragment";
import { getRoomKey, setRoomKey } from "../../lib/roomKeyStore";

function Probe({ remote, joinCode }: { remote: boolean; joinCode: string | undefined }) {
  useCohostKeyFromFragment(remote, joinCode);
  return null;
}

function setHash(hash: string) {
  window.history.replaceState(null, "", `/remote/ROOM1${hash}`);
}

describe("useCohostKeyFromFragment", () => {
  beforeEach(() => {
    localStorage.clear();
    setHash("");
  });

  it("stores the fragment's key as cohost and strips the fragment", () => {
    setHash("#k=secret-key");
    render(<Probe remote={true} joinCode="ROOM1" />);

    expect(getRoomKey("ROOM1")).toEqual({ key: "secret-key", role: "cohost" });
    expect(window.location.hash).toBe("");
  });

  it("does nothing on the host page (remote=false)", () => {
    setHash("#k=secret-key");
    render(<Probe remote={false} joinCode="ROOM1" />);

    expect(getRoomKey("ROOM1")).toBeNull();
    expect(window.location.hash).toBe("#k=secret-key");
  });

  it("does nothing when the fragment carries no key", () => {
    setHash("#other=1");
    render(<Probe remote={true} joinCode="ROOM1" />);

    expect(getRoomKey("ROOM1")).toBeNull();
    expect(window.location.hash).toBe("#other=1");
  });

  it("keeps a device's own host key instead of overwriting it with the cohost key, but still strips the fragment", () => {
    setRoomKey("ROOM1", "my-host-key", "host");
    setHash("#k=secret-cohost-key");
    render(<Probe remote={true} joinCode="ROOM1" />);

    expect(getRoomKey("ROOM1")).toEqual({ key: "my-host-key", role: "host" });
    expect(window.location.hash).toBe("");
  });
});
