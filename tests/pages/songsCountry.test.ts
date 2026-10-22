import { describe, it, expect, vi, beforeEach } from "vitest";

const readTopSongsMock = vi.fn();
vi.mock("../../lib/songChartsServer", async () => {
  const actual = await vi.importActual<typeof import("../../lib/songChartsServer")>(
    "../../lib/songChartsServer"
  );
  return {
    ...actual,
    readTopSongs: (...args: unknown[]) => readTopSongsMock(...args),
  };
});

import { getStaticProps } from "../../pages/songs/[country]";
import { CHART_MIN_SONGS } from "../../lib/songCharts";

beforeEach(() => {
  vi.clearAllMocks();
});

function manySongs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ title: `Song ${i}`, artist: `Artist ${i}` }));
}

describe("pages/songs/[country] getStaticProps", () => {
  it("404s on an unknown country without touching the DB", async () => {
    const result: any = await getStaticProps({
      params: { country: "zz" },
      locale: "en",
    } as any);
    expect(result.notFound).toBe(true);
    expect(readTopSongsMock).not.toHaveBeenCalled();
  });

  it("404s on an uppercase/mixed-case country without touching the DB", async () => {
    const result: any = await getStaticProps({
      params: { country: "US" },
      locale: "en",
    } as any);
    expect(result.notFound).toBe(true);
    expect(readTopSongsMock).not.toHaveBeenCalled();
  });

  it("404s when the country is below the threshold", async () => {
    readTopSongsMock.mockResolvedValue(manySongs(CHART_MIN_SONGS - 1));
    const result: any = await getStaticProps({
      params: { country: "us" },
      locale: "en",
    } as any);
    expect(result.notFound).toBe(true);
  });

  it("rejects on a DB error so ISR keeps serving the previous page", async () => {
    readTopSongsMock.mockRejectedValue(new Error("down"));
    await expect(
      getStaticProps({ params: { country: "us" }, locale: "en" } as any)
    ).rejects.toThrow("down");
  });

  it("returns props and a day-long revalidate once the threshold is met", async () => {
    readTopSongsMock.mockResolvedValue(manySongs(CHART_MIN_SONGS));
    const result: any = await getStaticProps({
      params: { country: "us" },
      locale: "en",
    } as any);
    expect(result.props.country).toBe("us");
    expect(result.props.songs).toHaveLength(CHART_MIN_SONGS);
    expect(result.revalidate).toBe(86400);
  });
});
