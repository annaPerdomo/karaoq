import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHostJoinedFromTv } from "../../components/host/hooks/useHostJoinedFromTv";

const postHostJoined = vi.fn();
vi.mock("../../app/queue/postHostJoined", () => ({
  default: (...args: unknown[]) => postHostJoined(...args),
}));

const replace = vi.fn();
let query: Record<string, string> = {};
vi.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/host/[joinCode]", query, replace }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  postHostJoined.mockResolvedValue(true);
});

describe("useHostJoinedFromTv", () => {
  it("reports the scan and strips only the via param", async () => {
    query = { joinCode: "ABCDE", via: "tv", admin: "1" };
    renderHook(() => useHostJoinedFromTv("ABCDE", false));

    expect(postHostJoined).toHaveBeenCalledWith("ABCDE");
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        { pathname: "/host/[joinCode]", query: { joinCode: "ABCDE", admin: "1" } },
        undefined,
        { shallow: true }
      )
    );
  });

  it("keeps the param when the report fails, so a reload retries", async () => {
    postHostJoined.mockResolvedValue(false);
    query = { joinCode: "ABCDE", via: "tv" };
    renderHook(() => useHostJoinedFromTv("ABCDE", false));

    await waitFor(() => expect(postHostJoined).toHaveBeenCalled());
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does nothing without the param", () => {
    query = { joinCode: "ABCDE" };
    renderHook(() => useHostJoinedFromTv("ABCDE", false));
    expect(postHostJoined).not.toHaveBeenCalled();
  });

  it("does nothing on the co-host surface", () => {
    query = { joinCode: "ABCDE", via: "tv" };
    renderHook(() => useHostJoinedFromTv("ABCDE", true));
    expect(postHostJoined).not.toHaveBeenCalled();
  });
});
