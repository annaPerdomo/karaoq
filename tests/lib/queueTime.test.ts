import { describe, it, expect } from "vitest";
import { QueueEntry } from "../../pages/api/types";
import {
  CHANGEOVER_SECONDS,
  DEFAULT_SONG_SECONDS,
  assumedSongSeconds,
  clockTimeToEpoch,
  epochToClockInput,
  estimateQueue,
  formatApproxDuration,
  roundEtaSeconds,
  runsPastEnd,
  slotFor,
  songsThatFit,
} from "../../lib/queueTime";

const NOW = Date.UTC(2026, 7, 2, 20, 0, 0);

function entry(id: string, durationSeconds?: number): QueueEntry {
  return {
    id,
    userName: `Singer ${id}`,
    songTitle: `Song ${id}`,
    videoId: "dQw4w9WgXcQ",
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
}

// The English catalog's shape, enough to exercise the formatter without React.
const t = (key: string, vars?: Record<string, string | number>) => {
  const templates: Record<string, string> = {
    "time.lessThanMinute": "<1 min",
    "time.minutes": "{count} min",
    "time.hours": "{count} hr",
    "time.hoursMinutes": "{hours} hr {minutes} min",
  };
  const template = templates[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    vars && name in vars ? String(vars[name]) : m
  );
};

describe("assumedSongSeconds", () => {
  it("falls back to the default when no song's length is known", () => {
    expect(assumedSongSeconds([entry("a"), entry("b")])).toBe(DEFAULT_SONG_SECONDS);
  });

  it("averages the room's own known lengths", () => {
    expect(assumedSongSeconds([entry("a", 200), entry("b", 300)])).toBe(250);
  });

  it("ignores implausible lengths rather than skewing the average", () => {
    // A 5s clip and a 24h livestream would each wreck the estimate.
    expect(assumedSongSeconds([entry("a", 240), entry("b", 5), entry("c", 90_000)])).toBe(240);
  });

  it("learns from songs already sung, not just upcoming ones", () => {
    expect(assumedSongSeconds([entry("done", 400), entry("next")])).toBe(400);
  });
});

describe("estimateQueue", () => {
  it("returns nothing for an empty queue", () => {
    const est = estimateQueue({ queue: [], activeVideoIndex: 0, isPlaying: false, now: NOW });
    expect(est.slots).toEqual([]);
    expect(est.totalSeconds).toBe(0);
    expect(est.endsAt).toBe(NOW);
  });

  it("stacks songs back to back with a changeover between them", () => {
    const est = estimateQueue({
      queue: [entry("a", 200), entry("b", 300)],
      activeVideoIndex: 0,
      isPlaying: false,
      now: NOW,
    });
    expect(est.slots.map((s) => s.startsInSeconds)).toEqual([0, 200 + CHANGEOVER_SECONDS]);
    // No changeover is waited out after the final song.
    expect(est.totalSeconds).toBe(200 + CHANGEOVER_SECONDS + 300);
    expect(est.endsAt).toBe(NOW + est.totalSeconds * 1000);
  });

  it("counts down the song on stage instead of restarting it", () => {
    const est = estimateQueue({
      queue: [entry("a", 200), entry("b", 300)],
      activeVideoIndex: 0,
      isPlaying: true,
      playStartedAt: new Date(NOW - 150_000).toISOString(),
      now: NOW,
    });
    // 50s of the on-stage song remains.
    expect(est.slots[1].startsInSeconds).toBe(50 + CHANGEOVER_SECONDS);
    expect(est.totalSeconds).toBe(50 + CHANGEOVER_SECONDS + 300);
  });

  it("never runs the on-stage song negative when it has overrun", () => {
    const est = estimateQueue({
      queue: [entry("a", 200), entry("b", 300)],
      activeVideoIndex: 0,
      isPlaying: true,
      playStartedAt: new Date(NOW - 600_000).toISOString(),
      now: NOW,
    });
    expect(est.slots[1].startsInSeconds).toBe(CHANGEOVER_SECONDS);
  });

  it("ignores a stale playStartedAt from a room left open for hours", () => {
    const est = estimateQueue({
      queue: [entry("a", 200), entry("b", 300)],
      activeVideoIndex: 0,
      isPlaying: true,
      playStartedAt: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(),
      now: NOW,
    });
    // Treated as not yet played rather than as a song that ended hours ago.
    expect(est.slots[1].startsInSeconds).toBe(200 + CHANGEOVER_SECONDS);
  });

  it("skips songs already sung", () => {
    const est = estimateQueue({
      queue: [entry("done", 200), entry("a", 200), entry("b", 200)],
      activeVideoIndex: 1,
      isPlaying: false,
      now: NOW,
    });
    expect(est.slots.map((s) => s.id)).toEqual(["a", "b"]);
    expect(est.slots[0].index).toBe(1);
  });

  it("fills unknown lengths from the room average and flags the estimate", () => {
    const est = estimateQueue({
      queue: [entry("a", 300), entry("b")],
      activeVideoIndex: 0,
      isPlaying: false,
      now: NOW,
    });
    expect(est.assumedSongSeconds).toBe(300);
    expect(est.slots[1].songSeconds).toBe(300);
    expect(est.slots[1].knownLength).toBe(false);
    expect(est.approximate).toBe(true);
  });

  it("is not approximate when every upcoming song's length is known", () => {
    const est = estimateQueue({
      queue: [entry("a", 300), entry("b", 240)],
      activeVideoIndex: 0,
      isPlaying: false,
      now: NOW,
    });
    expect(est.approximate).toBe(false);
  });

  it("looks a specific singer's entry up by id", () => {
    const est = estimateQueue({
      queue: [entry("a", 200), entry("mine", 200)],
      activeVideoIndex: 0,
      isPlaying: false,
      now: NOW,
    });
    expect(slotFor(est, "mine")?.startsInSeconds).toBe(200 + CHANGEOVER_SECONDS);
    expect(slotFor(est, "nope")).toBeNull();
  });
});

describe("runsPastEnd", () => {
  const est = estimateQueue({
    queue: [entry("a", 300), entry("b", 300)],
    activeVideoIndex: 0,
    isPlaying: false,
    now: NOW,
  });

  it("is false when the room has no end time", () => {
    expect(runsPastEnd(slotFor(est, "b"), null)).toBe(false);
  });

  it("flags a song still running when the time is up", () => {
    // 'b' runs 330s–630s from now; the room is out at 600s.
    expect(runsPastEnd(slotFor(est, "b"), NOW + 600_000)).toBe(true);
    expect(runsPastEnd(slotFor(est, "b"), NOW + 700_000)).toBe(false);
  });

  it("is false for a song that isn't upcoming at all", () => {
    expect(runsPastEnd(null, NOW)).toBe(false);
  });
});

describe("songsThatFit", () => {
  it("counts nothing when the time is already up", () => {
    expect(songsThatFit(0, 240)).toBe(0);
    expect(songsThatFit(-60, 240)).toBe(0);
  });

  it("gives back the changeover after the last song", () => {
    // 240 + 30 + 240 = 510s of singing fits in 510s.
    expect(songsThatFit(510, 240)).toBe(2);
    expect(songsThatFit(509, 240)).toBe(1);
  });
});

describe("roundEtaSeconds", () => {
  it("collapses anything under a minute", () => {
    expect(roundEtaSeconds(0)).toBe(0);
    expect(roundEtaSeconds(59)).toBe(0);
  });

  it("keeps whole minutes up close", () => {
    expect(roundEtaSeconds(200)).toBe(180);
    expect(roundEtaSeconds(500)).toBe(480);
  });

  it("rounds to 5 minutes past ten, and 10 minutes past an hour", () => {
    expect(roundEtaSeconds(37 * 60)).toBe(35 * 60);
    expect(roundEtaSeconds(83 * 60)).toBe(80 * 60);
  });
});

describe("clockTimeToEpoch", () => {
  // Local time, since that's what a host reads off the wall.
  const at = (hours: number, minutes = 0) => {
    const d = new Date(NOW);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  };
  const nineFifteenPm = at(21, 15);

  it("resolves a later time today", () => {
    expect(clockTimeToEpoch("23:30", nineFifteenPm)).toBe(at(23, 30));
  });

  it("rolls a small-hours end time into tomorrow", () => {
    const tomorrowOne = new Date(nineFifteenPm);
    tomorrowOne.setHours(1, 0, 0, 0);
    tomorrowOne.setDate(tomorrowOne.getDate() + 1);
    expect(clockTimeToEpoch("01:00", nineFifteenPm)).toBe(tomorrowOne.getTime());
  });

  it("keeps a just-passed time today so an overrun can be recorded", () => {
    expect(clockTimeToEpoch("21:05", nineFifteenPm)).toBe(at(21, 5));
  });

  it("rejects anything that isn't a clock time", () => {
    expect(clockTimeToEpoch("")).toBeNull();
    expect(clockTimeToEpoch("late")).toBeNull();
    expect(clockTimeToEpoch("25:00")).toBeNull();
    expect(clockTimeToEpoch("22:70")).toBeNull();
  });

  it("round-trips through the time-input format", () => {
    const epoch = clockTimeToEpoch("22:45", nineFifteenPm)!;
    expect(epochToClockInput(epoch)).toBe("22:45");
  });
});

describe("formatApproxDuration", () => {
  it("labels sub-minute waits without a number", () => {
    expect(formatApproxDuration(20, t)).toBe("<1 min");
  });

  it("formats minutes and hours", () => {
    expect(formatApproxDuration(180, t)).toBe("3 min");
    expect(formatApproxDuration(60 * 60, t)).toBe("1 hr");
    expect(formatApproxDuration(80 * 60, t)).toBe("1 hr 20 min");
  });

  it("never reports a negative wait", () => {
    expect(formatApproxDuration(-500, t)).toBe("<1 min");
  });
});
