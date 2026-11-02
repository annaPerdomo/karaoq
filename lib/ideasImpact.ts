import { getAnalyticsDb } from "./mongodb";

export const IMPACT_WEEKS = 12;
export const SURFACE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_TIMEOUT_MS = 15_000;

/** Taps that name a song. A genre_chip only opens a list, so it can't convert. */
const SONG_TAPS = ["song_pick", "shelf", "random"];

export interface ImpactWeek {
  /** Monday the week starts on, UTC, as YYYY-MM-DD. */
  weekStart: string;
  adds: number;
  ideas: number;
}

export interface ImpactSurface {
  /** "unknown" for events from before the surface was recorded. */
  surface: string;
  away: boolean | null;
  taps: number;
  adds: number;
}

export interface IdeasImpact {
  weeks: ImpactWeek[];
  surfaces: ImpactSurface[];
}

export function weekStart(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

export async function computeIdeasImpact(now: Date = new Date()): Promise<IdeasImpact> {
  const events = (await getAnalyticsDb()).collection("analytics_events");
  const firstWeek = weekStart(new Date(now.getTime() - (IMPACT_WEEKS - 1) * 7 * DAY_MS));
  const surfaceSince = new Date(now.getTime() - SURFACE_WINDOW_DAYS * DAY_MS);

  const [adds, taps] = await Promise.all([
    events
      .find(
        { type: "song_added", timestamp: { $gte: new Date(`${firstWeek}T00:00:00.000Z`) } },
        { projection: { timestamp: 1, suggestionKey: 1, ideaSurface: 1, ideaAway: 1 } }
      )
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .toArray(),
    events
      .find(
        {
          type: "suggestion_used",
          suggestionSource: { $in: SONG_TAPS },
          timestamp: { $gte: surfaceSince },
        },
        { projection: { ideaSurface: 1, ideaAway: 1 } }
      )
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .toArray(),
  ]);

  const weeks = new Map<string, ImpactWeek>();
  for (let i = 0; i < IMPACT_WEEKS; i++) {
    const start = weekStart(new Date(new Date(`${firstWeek}T00:00:00.000Z`).getTime() + i * 7 * DAY_MS));
    weeks.set(start, { weekStart: start, adds: 0, ideas: 0 });
  }
  const surfaces = new Map<string, ImpactSurface>();
  const surfaceRow = (doc: Record<string, unknown>) => {
    const surface = typeof doc.ideaSurface === "string" ? doc.ideaSurface : "unknown";
    const away = typeof doc.ideaAway === "boolean" ? doc.ideaAway : null;
    const key = `${surface}:${away}`;
    if (!surfaces.has(key)) surfaces.set(key, { surface, away, taps: 0, adds: 0 });
    return surfaces.get(key)!;
  };

  for (const add of adds) {
    const week = weeks.get(weekStart(add.timestamp as Date));
    if (!week) continue;
    week.adds += 1;
    if (!add.suggestionKey) continue;
    week.ideas += 1;
    if ((add.timestamp as Date) >= surfaceSince) surfaceRow(add).adds += 1;
  }
  for (const tap of taps) surfaceRow(tap).taps += 1;

  return {
    weeks: Array.from(weeks.values()),
    surfaces: Array.from(surfaces.values()).sort((a, b) => b.adds - a.adds || b.taps - a.taps),
  };
}
