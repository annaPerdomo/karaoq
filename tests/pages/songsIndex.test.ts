import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const readTopSongsMock = vi.fn();
const countriesWithChartsMock = vi.fn();
vi.mock("../../lib/songChartsServer", () => ({
  readTopSongs: (...args: unknown[]) => readTopSongsMock(...args),
  countriesWithCharts: (...args: unknown[]) => countriesWithChartsMock(...args),
}));

import { getStaticProps } from "../../pages/songs/index";

const ORIGINAL_NEXT_PHASE = process.env.NEXT_PHASE;

beforeEach(() => {
  vi.clearAllMocks();
  countriesWithChartsMock.mockResolvedValue({ countries: ["us"], allOk: true });
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_NEXT_PHASE === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = ORIGINAL_NEXT_PHASE;
});

describe("pages/songs getStaticProps — happy paths", () => {
  it("returns songs and a day-long revalidate on success", async () => {
    readTopSongsMock.mockResolvedValue([{ title: "A", artist: "B" }]);
    const result: any = await getStaticProps({ locale: "en" } as any);
    expect(result.props.songs).toEqual([{ title: "A", artist: "B" }]);
    expect(result.revalidate).toBe(86400);
  });

  it("treats a successful-but-empty read the same as an outage", async () => {
    readTopSongsMock.mockResolvedValue([]);
    const result: any = await getStaticProps({ locale: "en" } as any);
    expect(result.props.songs).toEqual([]);
    expect(result.revalidate).toBe(300);
  });

  it("passes only the countries that currently clear the threshold", async () => {
    readTopSongsMock.mockResolvedValue([{ title: "A", artist: "B" }]);
    countriesWithChartsMock.mockResolvedValue({ countries: ["us", "ph"], allOk: true });
    const result: any = await getStaticProps({ locale: "en" } as any);
    expect(result.props.countries).toEqual(["us", "ph"]);
  });

  it("omits a failed country but still retries sooner", async () => {
    readTopSongsMock.mockResolvedValue([{ title: "A", artist: "B" }]);
    countriesWithChartsMock.mockResolvedValue({ countries: ["us"], allOk: false });
    const result: any = await getStaticProps({ locale: "en" } as any);
    expect(result.props.countries).toEqual(["us"]);
    expect(result.revalidate).toBe(300);
  });
});

describe("pages/songs getStaticProps — runtime vs. build-time failure", () => {
  it("rethrows a DB error at runtime so ISR keeps the stale page", async () => {
    delete process.env.NEXT_PHASE;
    readTopSongsMock.mockRejectedValue(new Error("down"));
    await expect(getStaticProps({ locale: "en" } as any)).rejects.toThrow("down");
  });

  it("falls back to an empty page at build time instead of failing the build", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    readTopSongsMock.mockRejectedValue(new Error("down"));
    const result: any = await getStaticProps({ locale: "en" } as any);
    expect(result.props.songs).toEqual([]);
    expect(result.props.countries).toEqual([]);
    expect(result.revalidate).toBe(300);
  });

  it("rethrows a hung query past its timeout at runtime", async () => {
    vi.useFakeTimers();
    delete process.env.NEXT_PHASE;
    readTopSongsMock.mockReturnValue(new Promise(() => {}));
    const resultPromise = getStaticProps({ locale: "en" } as any);
    const assertion = expect(resultPromise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it("treats a hung query past its timeout as a build-time failure", async () => {
    vi.useFakeTimers();
    process.env.NEXT_PHASE = "phase-production-build";
    readTopSongsMock.mockReturnValue(new Promise(() => {}));
    const resultPromise = getStaticProps({ locale: "en" } as any);
    await vi.advanceTimersByTimeAsync(15000);
    const result: any = await resultPromise;
    expect(result.props.songs).toEqual([]);
    expect(result.revalidate).toBe(300);
  });
});
