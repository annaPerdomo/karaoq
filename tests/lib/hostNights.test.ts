import { describe, it, expect } from "vitest";
import {
  NIGHT_GAP_MS,
  buildHosts,
  mergeNights,
  roomNights,
  summarizeCameBack,
  type Host,
} from "../../lib/hostNights";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-11-01T02:00:00Z");

describe("roomNights", () => {
  it("keeps one evening's songs as one night, even past midnight", () => {
    expect(roomNights("A", [T0, T0 + HOUR, T0 + 5 * HOUR])).toEqual([{ start: T0, rooms: ["A"] }]);
  });

  it("starts a new night after a 12-hour silence", () => {
    const nights = roomNights("A", [T0 + 7 * DAY, T0, T0 + HOUR]);

    expect(nights.map((n) => n.start)).toEqual([T0, T0 + 7 * DAY]);
  });

  it("measures the silence from the last song, not from the night's start", () => {
    const stamps = [T0, T0 + 8 * HOUR, T0 + 16 * HOUR];

    expect(roomNights("A", stamps)).toHaveLength(1);
    expect(roomNights("A", [T0, T0 + NIGHT_GAP_MS])).toHaveLength(2);
  });
});

describe("mergeNights", () => {
  it("folds two rooms used the same evening into one night", () => {
    const nights = mergeNights([
      [{ start: T0, rooms: ["A"] }],
      [{ start: T0 + HOUR, rooms: ["B"] }],
    ]);

    expect(nights).toEqual([{ start: T0, rooms: ["A", "B"] }]);
  });
});

describe("buildHosts", () => {
  const nightsByRoom = new Map([
    ["A", roomNights("A", [T0, T0 + 7 * DAY])],
    ["B", roomNights("B", [T0 + 14 * DAY])],
  ]);

  it("drops a browser whose rooms never had a song", () => {
    const hosts = buildHosts(new Map([["c1", new Set(["EMPTY"])]]), nightsByRoom);

    expect(hosts).toEqual([]);
  });

  it("sees a room reused a week later as the same host coming back", () => {
    const [host] = buildHosts(new Map([["c1", new Set(["A"])]]), nightsByRoom);

    expect(host.nights).toHaveLength(2);
  });

  it("counts two browsers with the same history once", () => {
    const hosts = buildHosts(
      new Map([
        ["phone", new Set(["A", "B"])],
        ["laptop", new Set(["B", "A"])],
      ]),
      nightsByRoom
    );

    expect(hosts).toHaveLength(1);
  });

  it("folds a device that only joined a later night into the host it joined", () => {
    const hosts = buildHosts(
      new Map([
        ["late-phone", new Set(["B"])],
        ["laptop", new Set(["A", "B"])],
      ]),
      nightsByRoom
    );

    expect(hosts).toHaveLength(1);
    expect(hosts[0].nights).toHaveLength(3);
  });

  it("keeps hosts apart when each has a night the other lacks", () => {
    const hosts = buildHosts(
      new Map([
        ["one", new Set(["A"])],
        ["two", new Set(["B"])],
      ]),
      nightsByRoom
    );

    expect(hosts).toHaveLength(2);
  });
});

describe("summarizeCameBack", () => {
  const now = T0 + 30 * DAY;
  const host = (...starts: [number, string][]): Host => ({
    nights: starts.map(([start, room]) => ({ start, rooms: [room] })),
  });

  it("splits this week's hosts into returning and first-time", () => {
    const summary = summarizeCameBack(
      [
        host([now - 20 * DAY, "OLD"], [now - 2 * DAY, "NEW"]),
        host([now - DAY, "FIRST"]),
        host([now - 20 * DAY, "GONE"], [now - 10 * DAY, "GONE2"]),
      ],
      now
    );

    expect(summary.returning).toBe(1);
    expect(summary.firstTime).toBe(1);
    expect(summary.rows).toEqual([
      {
        roomId: "NEW",
        lastNightAt: new Date(now - 2 * DAY).toISOString(),
        nights: 2,
        firstRooms: ["OLD"],
      },
    ]);
  });

  it("lists the most recent returners first", () => {
    const summary = summarizeCameBack(
      [
        host([now - 20 * DAY, "A"], [now - 5 * DAY, "A"]),
        host([now - 20 * DAY, "B"], [now - DAY, "B"]),
      ],
      now
    );

    expect(summary.rows.map((r) => r.roomId)).toEqual(["B", "A"]);
  });
});
