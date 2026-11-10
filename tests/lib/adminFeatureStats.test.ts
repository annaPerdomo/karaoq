import { describe, it, expect } from "vitest";
import { ADMIN_FEATURES, featureMatch, featuresUsed, adminFeature } from "../../lib/adminFeatures";
import { summarizeFeatures, type FeatureTallyRow } from "../../lib/adminFeatureStats";
import type { Host } from "../../lib/hostNights";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-10T00:00:00Z");
const SINCE = NOW - 30 * DAY;

function row(type: string, roomId: string, at: number, extra: Partial<FeatureTallyRow> = {}): FeatureTallyRow {
  return {
    type,
    roomId,
    n: 1,
    duets: 0,
    ideas: 0,
    tracked: 0,
    found: 0,
    first: new Date(at),
    duetFirst: null,
    ideaFirst: null,
    ...extra,
  };
}

const host = (...nights: [number, string][]): Host => ({
  nights: nights.map(([start, room]) => ({ start, rooms: [room] })),
});

function card(stats: ReturnType<typeof summarizeFeatures>, id: string) {
  return stats.features.find((f) => f.id === id)!;
}

describe("the feature registry", () => {
  it("gives every feature a unique id", () => {
    const ids = ADMIN_FEATURES.map((f) => f.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks a room by its slice of song_added, not by any add", () => {
    expect(featuresUsed({ song_added: { n: 4, duets: 0, ideas: 0 } })).toEqual([]);
    expect(featuresUsed({ song_added: { n: 4, duets: 1, ideas: 0 } })).toEqual(["duets"]);
  });

  it("filters ideas on a suggestion key being present", () => {
    expect(featureMatch(adminFeature("ideas")!)).toEqual({
      type: { $in: ["song_added"] },
      suggestionKey: { $ne: null },
    });
    expect(adminFeature("nope")).toBeNull();
  });
});

describe("summarizeFeatures", () => {
  it("counts rooms that used a feature against the rooms that sang", () => {
    const stats = summarizeFeatures(
      [
        row("song_added", "A", NOW - 3 * DAY),
        row("song_added", "B", NOW - 2 * DAY),
        row("music_video_screen_opened", "A", NOW - 3 * DAY),
        row("music_video_link", "A", NOW - 3 * DAY),
        row("music_video_link", "SILENT", NOW - 3 * DAY),
      ],
      [],
      SINCE,
      30
    );

    expect(stats.roomsSang).toBe(2);
    expect(card(stats, "musicVideo").rooms).toBe(1);
    expect(card(stats, "boards").rooms).toBe(0);
  });

  it("shows a small sample as counts and a large one as a percentage", () => {
    const small = summarizeFeatures(
      [row("original_video_resolved", "A", NOW - DAY, { n: 8, found: 6 })],
      [],
      SINCE,
      30
    );
    const large = summarizeFeatures(
      [row("original_video_resolved", "A", NOW - DAY, { n: 40, found: 30 })],
      [],
      SINCE,
      30
    );

    expect(card(small, "musicVideo").stat).toEqual({
      label: "Worked",
      value: "6 of 8",
      sub: "songs had a video",
    });
    expect(card(large, "musicVideo").stat.value).toBe("75%");
  });

  it("measures ideas by rooms, since a browse tap can't queue a song", () => {
    const stats = summarizeFeatures(
      [
        row("suggestion_used", "A", NOW - DAY, { n: 12 }),
        row("suggestion_used", "B", NOW - DAY, { n: 3 }),
        row("song_added", "A", NOW - DAY, { n: 5, ideas: 2, ideaFirst: new Date(NOW - DAY) }),
      ],
      [],
      SINCE,
      30
    );

    expect(card(stats, "ideas").stat.value).toBe("1 of 2");
    expect(card(stats, "ideas").rooms).toBe(1);
  });

  it("counts a host as back only for a night after the one they used it on", () => {
    const used = NOW - 10 * DAY;
    const hosts = [
      // Used it on their second night and never came back. The first night
      // predates the window, so the baseline doesn't count them as back either.
      host([NOW - 40 * DAY, "A"], [used, "A"]),
      // Used it, then hosted again.
      host([used, "B"], [NOW - 3 * DAY, "B"]),
      // Never used it.
      host([used, "C"], [NOW - 3 * DAY, "C"]),
    ];
    const stats = summarizeFeatures(
      [
        row("karaoke_video_swapped", "A", used + 1000),
        row("karaoke_video_swapped", "B", used + 1000),
      ],
      hosts,
      SINCE,
      30
    );

    expect(card(stats, "swap").hosts).toBe(2);
    expect(card(stats, "swap").hostsReturned).toBe(1);
    expect(stats.baseline).toEqual({ hosts: 3, returned: 2 });
  });

  it("leaves hosts with no night on record out of the came-back count", () => {
    const stats = summarizeFeatures([row("brand_saved", "A", NOW - DAY)], [], SINCE, 30);

    expect(card(stats, "branding")).toMatchObject({ rooms: 0, hosts: 0, hostsReturned: 0 });
  });
});
