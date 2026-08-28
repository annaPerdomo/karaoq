import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeCollection, type FakeCollection } from "../helpers/fakeCollection";

const collections = new Map<string, FakeCollection>();

function collection(name: string): FakeCollection {
  if (!collections.has(name)) collections.set(name, fakeCollection());
  return collections.get(name)!;
}

let failNext = false;

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: (name: string) => {
          if (failNext) throw new Error("Atlas failover");
          return collection(name);
        },
        command: vi.fn(async () => ({})),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { CORPUS_BUSY_WINDOW_MS } from "../../lib/liveWindows";
import { liveRoomCount } from "../../lib/liveRooms";

const rooms = () => collection("rooms");
const MINUTE = 60_000;

function room(id: string, lastActivity: Date) {
  rooms().seed({ _id: id, id, lastActivity });
}

beforeEach(() => {
  collections.clear();
  failNext = false;
});

describe("counting the rooms in use", () => {
  it("counts a room somebody touched inside the window", async () => {
    const now = Date.now();
    room("AAA11", new Date(now - 5 * MINUTE));

    expect(await liveRoomCount(now)).toBe(1);
  });

  it("lets go of a party that ended before the window", async () => {
    const now = Date.now();
    room("AAA11", new Date(now - CORPUS_BUSY_WINDOW_MS - MINUTE));

    expect(await liveRoomCount(now)).toBe(0);
  });

  it("counts every live room, since any of them may search next", async () => {
    const now = Date.now();
    room("AAA11", new Date(now - MINUTE));
    room("BBB22", new Date(now - 30 * MINUTE));
    room("CCC33", new Date(now - 3 * 60 * MINUTE));

    expect(await liveRoomCount(now)).toBe(2);
  });

  it("honours a caller's own window", async () => {
    const now = Date.now();
    room("AAA11", new Date(now - 20 * MINUTE));

    expect(await liveRoomCount(now, 10 * MINUTE)).toBe(0);
    expect(await liveRoomCount(now, 30 * MINUTE)).toBe(1);
  });

  // The count decides whether the cron may spend YouTube calls. A database blip
  // must not read as "nobody is here" and hand the night's quota away.
  it("reports busy when the database can't answer", async () => {
    failNext = true;

    expect(await liveRoomCount(Date.now())).toBe(1);
  });
});
