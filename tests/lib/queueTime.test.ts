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
  normalizeSessionEnd,
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
  });

  it("fills unknown lengths from the room average", () => {
    const est = estimateQueue({
      queue: [entry("a", 300), entry("b")],
      activeVideoIndex: 0,
      isPlaying: false,
      now: NOW,
    });
    expect(est.assumedSongSeconds).toBe(300);
    expect(est.slots[1].songSeconds).toBe(300);
  });

  // A pause that keeps burning the on-stage song's clock makes every ETA in the
  // room run early by the length of the break.
  it("stops the clock while the room is paused", () => {
    const paused = estimateQueue({
      queue: [entry("a", 200), entry("b", 300)],
      activeVideoIndex: 0,
      isPlaying: true,
      playStartedAt: new Date(NOW - 600_000).toISOString(),
      // Paused 30s in, and standing still ever since.
      playPausedAt: new Date(NOW - 570_000).toISOString(),
      now: NOW,
    });
    expect(paused.slots[1].startsInSeconds).toBe(170 + CHANGEOVER_SECONDS);
  });

  it("ignores a pause stamp older than the song it belongs to", () => {
    const est = estimateQueue({
      queue: [entry("a", 200)],
      activeVideoIndex: 0,
      isPlaying: true,
      playStartedAt: new Date(NOW - 60_000).toISOString(),
      // Left over from a previous song; must not read as negative progress.
      playPausedAt: new Date(NOW - 900_000).toISOString(),
      now: NOW,
    });
    expect(est.totalSeconds).toBe(200);
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

describe("normalizeSessionEnd", () => {
  it("keeps a wrap-up time that's still ahead", () => {
    expect(normalizeSessionEnd(new Date(NOW + 3_600_000), NOW)).toBe(NOW + 3_600_000);
  });

  it("keeps a recently-passed one — that's who the overrun warning is for", () => {
    expect(normalizeSessionEnd(new Date(NOW - 20 * 60_000), NOW)).toBe(NOW - 20 * 60_000);
  });

  // Room codes are reusable for 30 days; last weekend's 11pm must not flag
  // every song in tonight's queue as overrunning.
  it("discards one from a previous session", () => {
    expect(normalizeSessionEnd(new Date(NOW - 7 * 24 * 3_600_000), NOW)).toBeNull();
    expect(normalizeSessionEnd(new Date(NOW - 5 * 3_600_000), NOW)).toBeNull();
  });

  it("treats absent and unparseable values as no wrap-up time", () => {
    expect(normalizeSessionEnd(null, NOW)).toBeNull();
    expect(normalizeSessionEnd(undefined, NOW)).toBeNull();
    expect(normalizeSessionEnd("not a date", NOW)).toBeNull();
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

  it("charges each song the changeover that gets it on stage", () => {
    // The queue's own trailing changeover is already excluded from the time
    // left, so an added song costs 30 + 240 and a second one costs that again.
    expect(songsThatFit(270, 240)).toBe(1);
    expect(songsThatFit(269, 240)).toBe(0);
    expect(songsThatFit(540, 240)).toBe(2);
    expect(songsThatFit(539, 240)).toBe(1);
  });

  it("agrees with the singer's warning about the same room", () => {
    // What YourTurnCard asks: with this much room after the queue runs dry,
    // does one more song fit? Host and singer must never answer differently.
    expect(songsThatFit(271, 240)).toBeGreaterThan(0);
    expect(songsThatFit(120, 240)).toBe(0);
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
