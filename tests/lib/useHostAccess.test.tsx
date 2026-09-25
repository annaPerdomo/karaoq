import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render } from "@testing-library/react";
import { useHostAccess } from "../../components/host/hooks/useHostAccess";
import { setRoomKey } from "../../lib/roomKeyStore";

function harness() {
  const state: { access?: string } = {};

  function Probe({
    joinCode,
    remote,
    roomKeyed,
  }: {
    joinCode: string | undefined;
    remote: boolean;
    roomKeyed: boolean | null;
  }) {
    state.access = useHostAccess(joinCode, remote, roomKeyed);
    return <div data-testid="access">{state.access}</div>;
  }

  return { Probe, state };
}

describe("useHostAccess", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is 'checking' before the room has loaded", () => {
    const { Probe, state } = harness();
    render(<Probe joinCode="ROOM1" remote={false} roomKeyed={null} />);
    expect(state.access).toBe("checking");
  });

  it("is 'allowed' for a legacy room", () => {
    const { Probe, state } = harness();
    render(<Probe joinCode="ROOM1" remote={false} roomKeyed={false} />);
    expect(state.access).toBe("allowed");
  });

  it("is 'allowed' on the host page with a stored host key", () => {
    setRoomKey("ROOM1", "host-key", "host");
    const { Probe, state } = harness();
    render(<Probe joinCode="ROOM1" remote={false} roomKeyed={true} />);
    expect(state.access).toBe("allowed");
  });

  it("is 'locked' on a keyed room with no stored key", () => {
    const { Probe, state } = harness();
    render(<Probe joinCode="ROOM1" remote={false} roomKeyed={true} />);
    expect(state.access).toBe("locked");
  });

  it("is 'allowed' on /remote with a stored cohost key", () => {
    setRoomKey("ROOM1", "cohost-key", "cohost");
    const { Probe, state } = harness();
    render(<Probe joinCode="ROOM1" remote={true} roomKeyed={true} />);
    expect(state.access).toBe("allowed");
  });

  it("is 'locked' on the host page with a stored cohost key", () => {
    setRoomKey("ROOM1", "cohost-key", "cohost");
    const { Probe, state } = harness();
    render(<Probe joinCode="ROOM1" remote={false} roomKeyed={true} />);
    expect(state.access).toBe("locked");
  });
});
