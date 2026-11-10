import type { Db } from "mongodb";

// A host is a browser that opened a host page. Session docs keep only the
// latest sitting per room, so nights come from song_added instead: a venue
// reusing one room code weekly still reads as coming back. Sessions expire
// at 90 days, which caps a host's history.

export const NIGHT_GAP_MS = 12 * 60 * 60 * 1000;

export interface Night {
  /** ms epoch, truncated to the hour. */
  start: number;
  rooms: string[];
}

export interface Host {
  nights: Night[];
}

export function roomNights(roomId: string, stamps: number[]): Night[] {
  const sorted = [...stamps].sort((a, b) => a - b);
  const nights: Night[] = [];
  let previous = -Infinity;
  for (const stamp of sorted) {
    if (stamp - previous >= NIGHT_GAP_MS) nights.push({ start: stamp, rooms: [roomId] });
    previous = stamp;
  }
  return nights;
}

/** Two rooms on the same evening (a lost room re-created) are one night. */
export function mergeNights(perRoom: Night[][]): Night[] {
  const all = perRoom.flat().sort((a, b) => a.start - b.start);
  const nights: Night[] = [];
  for (const night of all) {
    const last = nights[nights.length - 1];
    if (last && night.start - last.start < NIGHT_GAP_MS) {
      for (const room of night.rooms) if (!last.rooms.includes(room)) last.rooms.push(room);
    } else {
      nights.push({ start: night.start, rooms: [...night.rooms] });
    }
  }
  return nights;
}

function sameNight(a: Night, b: Night): boolean {
  return Math.abs(a.start - b.start) < NIGHT_GAP_MS && a.rooms.some((room) => b.rooms.includes(room));
}

/** A browser whose every night is also another browser's is the same host (a
 *  second device, a co-host); counted apart, each reads as a first-timer. */
export function buildHosts(
  roomsByClient: Map<string, Set<string>>,
  nightsByRoom: Map<string, Night[]>
): Host[] {
  const candidates: Host[] = [];
  roomsByClient.forEach((rooms) => {
    const nights = mergeNights(
      Array.from(rooms, (roomId) => nightsByRoom.get(roomId) ?? [])
    );
    if (nights.length > 0) candidates.push({ nights });
  });
  candidates.sort((a, b) => b.nights.length - a.nights.length);

  const hosts: Host[] = [];
  const hostsByRoom = new Map<string, Host[]>();
  for (const candidate of candidates) {
    const sharing = new Set(
      candidate.nights.flatMap((n) => n.rooms.flatMap((room) => hostsByRoom.get(room) ?? []))
    );
    const covered = Array.from(sharing).some((kept) =>
      candidate.nights.every((night) => kept.nights.some((k) => sameNight(k, night)))
    );
    if (covered) continue;
    hosts.push(candidate);
    for (const night of candidate.nights) {
      for (const room of night.rooms) {
        const list = hostsByRoom.get(room);
        if (list) list.push(candidate);
        else hostsByRoom.set(room, [candidate]);
      }
    }
  }
  return hosts;
}

export async function loadHosts(db: Db): Promise<Host[]> {
  const sessions = await db
    .collection("analytics_sessions")
    .find({ role: "host", clientId: { $type: "string" } })
    .project<{ clientId: string; roomId: string }>({ _id: 0, clientId: 1, roomId: 1 })
    .toArray();

  const roomsByClient = new Map<string, Set<string>>();
  for (const { clientId, roomId } of sessions) {
    if (!roomId) continue;
    let rooms = roomsByClient.get(clientId);
    if (!rooms) roomsByClient.set(clientId, (rooms = new Set()));
    rooms.add(roomId);
  }
  const hostedRooms = Array.from(new Set(sessions.map((s) => s.roomId).filter(Boolean)));
  if (hostedRooms.length === 0) return [];

  const hours = await db
    .collection("analytics_events")
    .aggregate<{ _id: { roomId: string; hour: string } }>([
      { $match: { type: "song_added", roomId: { $in: hostedRooms } } },
      {
        $group: {
          _id: {
            roomId: "$roomId",
            hour: { $dateToString: { format: "%Y-%m-%dT%H", date: "$timestamp" } },
          },
        },
      },
    ])
    .toArray();

  const stampsByRoom = new Map<string, number[]>();
  for (const { _id } of hours) {
    const stamp = Date.parse(`${_id.hour}:00:00Z`);
    if (Number.isNaN(stamp)) continue;
    let stamps = stampsByRoom.get(_id.roomId);
    if (!stamps) stampsByRoom.set(_id.roomId, (stamps = []));
    stamps.push(stamp);
  }
  const nightsByRoom = new Map<string, Night[]>();
  stampsByRoom.forEach((stamps, roomId) => nightsByRoom.set(roomId, roomNights(roomId, stamps)));

  return buildHosts(roomsByClient, nightsByRoom);
}

export interface CameBackRow {
  roomId: string;
  lastNightAt: string;
  nights: number;
  firstRooms: string[];
}

export interface CameBackSummary {
  windowDays: number;
  returning: number;
  firstTime: number;
  rows: CameBackRow[];
}

export const CAME_BACK_DAYS = 7;
const CAME_BACK_ROWS = 20;

export function summarizeCameBack(
  hosts: Host[],
  now: number,
  windowDays: number = CAME_BACK_DAYS
): CameBackSummary {
  const since = now - windowDays * 24 * 60 * 60 * 1000;
  let firstTime = 0;
  const rows: CameBackRow[] = [];
  for (const { nights } of hosts) {
    const last = nights[nights.length - 1];
    if (last.start < since) continue;
    if (nights.length === 1) {
      firstTime += 1;
      continue;
    }
    rows.push({
      roomId: last.rooms[last.rooms.length - 1],
      lastNightAt: new Date(last.start).toISOString(),
      nights: nights.length,
      firstRooms: nights[0].rooms,
    });
  }
  rows.sort((a, b) => b.lastNightAt.localeCompare(a.lastNightAt));
  return { windowDays, returning: rows.length, firstTime, rows: rows.slice(0, CAME_BACK_ROWS) };
}
