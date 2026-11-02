import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConnectTv } from "../../../components/host/hooks/useConnectTv";

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
  it("adopts TV mode and toasts when a TV claims this room", () => {
    const { result, setPlayMode, rememberMode, showToast } = setup("ROOM1");
    result.current.onTvPaired({ roomId: "ROOM1" });

    expect(setPlayMode).toHaveBeenCalledWith("tv");
    expect(rememberMode).toHaveBeenCalledWith("tv");
    expect(showToast).toHaveBeenCalledWith("remote now");
  });

  it("does nothing when the claim names a different room", () => {
    const { result, setPlayMode, rememberMode, showToast } = setup("ROOM1");
    result.current.onTvPaired({ roomId: "OTHER" });

    expect(setPlayMode).not.toHaveBeenCalled();
    expect(rememberMode).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
