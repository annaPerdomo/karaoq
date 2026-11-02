import { describe, it, expect, vi, beforeEach } from "vitest";

const isFlagEnabledMock = vi.fn();
vi.mock("../../lib/featureFlags", () => ({
  isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args),
}));

const readTopSongsMock = vi.fn();
const countriesWithChartsMock = vi.fn();
vi.mock("../../lib/songChartsServer", () => ({
  readTopSongs: (...args: unknown[]) => readTopSongsMock(...args),
  countriesWithCharts: (...args: unknown[]) => countriesWithChartsMock(...args),
}));

import { getStaticProps as songsGetStaticProps } from "../../pages/songs/index";
import { getStaticProps as countryGetStaticProps } from "../../pages/songs/[country]";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("songs_pages kill switch", () => {
  it("404s pages/songs/index before touching the DB when off", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const result: any = await songsGetStaticProps({ locale: "en" } as any);
    expect(result).toEqual({ notFound: true, revalidate: 300 });
    expect(readTopSongsMock).not.toHaveBeenCalled();
    expect(countriesWithChartsMock).not.toHaveBeenCalled();
  });

  it("404s pages/songs/[country] before touching the DB when off", async () => {
    isFlagEnabledMock.mockResolvedValue(false);
    const result: any = await countryGetStaticProps({
      params: { country: "us" },
      locale: "en",
    } as any);
    expect(result).toEqual({ notFound: true, revalidate: 300 });
    expect(readTopSongsMock).not.toHaveBeenCalled();
  });

  it("leaves pages/songs/index unchanged when on", async () => {
    isFlagEnabledMock.mockResolvedValue(true);
    countriesWithChartsMock.mockResolvedValue({ countries: ["us"], allOk: true });
    readTopSongsMock.mockResolvedValue([{ title: "A", artist: "B" }]);
    const result: any = await songsGetStaticProps({ locale: "en" } as any);
    expect(result.props.songs).toEqual([{ title: "A", artist: "B" }]);
  });
});
