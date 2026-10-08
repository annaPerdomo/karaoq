import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConnectTv } from "../../../components/host/hooks/useConnectTv";

const mockPush = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(joinCode = "ROOM1") {
  const setPlayMode = vi.fn();
  const rememberMode = vi.fn();
  const showToast = vi.fn();
  const { result } = renderHook(() =>
    useConnectTv({ joinCode, setPlayMode, rememberMode, showToast, message: "remote now" })
  );
  return { result, setPlayMode, rememberMode, showToast };
}

describe("useConnectTv", () => {
  it("adopts TV mode and toasts when a screen claims this room", () => {
    const { result, setPlayMode, rememberMode, showToast } = setup("ROOM1");
    result.current.onTvPaired({ kind: "screen", roomId: "ROOM1" });

    expect(setPlayMode).toHaveBeenCalledWith("tv");
    expect(rememberMode).toHaveBeenCalledWith("tv");
    expect(showToast).toHaveBeenCalledWith("remote now");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does nothing for a screen result naming a different room", () => {
    const { result, setPlayMode, rememberMode, showToast } = setup("ROOM1");
    result.current.onTvPaired({ kind: "screen", roomId: "OTHER" });

    expect(setPlayMode).not.toHaveBeenCalled();
    expect(rememberMode).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to the host page for a remote result, without adopting TV mode", () => {
    const { result, setPlayMode, rememberMode, showToast } = setup("ROOM1");
    result.current.onTvPaired({ kind: "remote", roomId: "ROOM2" });

    expect(mockPush).toHaveBeenCalledWith("/host/ROOM2?paired=1");
    expect(setPlayMode).not.toHaveBeenCalled();
    expect(rememberMode).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
