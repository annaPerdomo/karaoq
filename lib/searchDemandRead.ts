import { getSearchDemandCollection } from "./mongodb";
import type { SearchDemandOutcome } from "./searchDemand";

export interface WantedSearchRow {
  key: string;
  label: string;
  /** Every search, cache hits included. */
  count: number;
  countries: { code: string; count: number }[];
  rooms: number;
  spent: number;
  unmet: number;
  catalogued: boolean;
  hasCuts: boolean;
  lastSeenAt: string;
}

export interface SearchDemandTotals {
  queries: number;
  searches: number;
  served: number;
  spent: number;
  stale: number;
  corpus: number;
  error: number;
}

export interface WantedSearchReport {
  totals: SearchDemandTotals;
  rows: WantedSearchRow[];
  /** Rows the filter kept, before the cap. */
  matched: number;
  limit: number;
}

export type WantedRank = "breadth" | "volume";

export interface WantedSearchQuery {
  limit?: number;
  rank?: WantedRank;
  gapsOnly?: boolean;
}

export const DEFAULT_WANTED_LIMIT = 50;
export const MAX_WANTED_LIMIT = 200;

function outcome(name: SearchDemandOutcome) {
  return { $ifNull: [`$outcomes.${name}`, 0] };
}

export async function wantedSearches(
  query: WantedSearchQuery = {}
): Promise<WantedSearchReport> {
  const limit = Math.min(
    Math.max(1, Math.floor(query.limit ?? DEFAULT_WANTED_LIMIT)),
    MAX_WANTED_LIMIT
  );
  const rank: WantedRank = query.rank === "volume" ? "volume" : "breadth";
  const sort =
    rank === "volume"
      ? { count: -1 as const, countryCount: -1 as const, _id: 1 as const }
      : { countryCount: -1 as const, rooms: -1 as const, count: -1 as const };

  const demand = await getSearchDemandCollection();
  const derive = [
    {
      $addFields: {
        countryList: { $objectToArray: { $ifNull: ["$byCountry", {}] } },
        rooms: { $size: { $ifNull: ["$rooms", []] } },
      },
    },
    { $addFields: { countryCount: { $size: "$countryList" } } },
    {
      $lookup: {
        from: "karaoke_songs",
        localField: "_id",
        foreignField: "_id",
        as: "song",
      },
    },
    {
      $addFields: {
        catalogued: { $gt: [{ $size: "$song" }, 0] },
        hasCuts: {
          $gt: [
            {
              $size: {
                $ifNull: [{ $arrayElemAt: ["$song.cuts", 0] }, []],
              },
            },
            0,
          ],
        },
      },
    },
    ...(query.gapsOnly ? [{ $match: { hasCuts: false } }] : []),
  ];

  const [result] = await demand
    .aggregate<{
      rows: RankedRow[];
      matched: { n: number }[];
      totals: RawTotals[];
    }>([
      {
        $facet: {
          rows: [
            ...derive,
            { $sort: sort },
            { $limit: limit },
            {
              $project: {
                label: 1,
                count: 1,
                countryList: 1,
                rooms: 1,
                catalogued: 1,
                hasCuts: 1,
                lastSeenAt: 1,
                spent: outcome("spent"),
                unmet: outcome("error"),
              },
            },
          ],
          matched: [...derive, { $count: "n" }],
          // Deliberately outside `derive`: the gap is a share of every search.
          totals: [
            {
              $group: {
                _id: null,
                queries: { $sum: 1 },
                searches: { $sum: "$count" },
                served: { $sum: outcome("served") },
                spent: { $sum: outcome("spent") },
                stale: { $sum: outcome("stale") },
                corpus: { $sum: outcome("corpus") },
                error: { $sum: outcome("error") },
              },
            },
          ],
        },
      },
    ])
    .toArray();

  return {
    totals: emptyTotals(result?.totals?.[0]),
    rows: (result?.rows ?? []).map(wantedRowFrom),
    matched: result?.matched?.[0]?.n ?? 0,
    limit,
  };
}

export interface RankedRow {
  _id: string;
  label?: string;
  count?: number;
  countryList?: { k: string; v: number }[];
  rooms?: number;
  catalogued?: boolean;
  hasCuts?: boolean;
  spent?: number;
  unmet?: number;
  lastSeenAt?: Date;
}

type RawTotals = Omit<SearchDemandTotals, never> & { _id: null };

export function wantedRowFrom(row: RankedRow): WantedSearchRow {
  const countries = (row.countryList ?? [])
    .map((c) => ({ code: c.k, count: c.v }))
    .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : 1));
  return {
    key: row._id,
    // A row written before the label existed still ranks, keyed but ugly.
    label: row.label ?? row._id,
    count: row.count ?? 0,
    countries,
    rooms: row.rooms ?? 0,
    spent: row.spent ?? 0,
    unmet: row.unmet ?? 0,
    catalogued: !!row.catalogued,
    hasCuts: !!row.hasCuts,
    lastSeenAt: (row.lastSeenAt ?? new Date(0)).toISOString(),
  };
}

function emptyTotals(raw?: RawTotals): SearchDemandTotals {
  return {
    queries: raw?.queries ?? 0,
    searches: raw?.searches ?? 0,
    served: raw?.served ?? 0,
    spent: raw?.spent ?? 0,
    stale: raw?.stale ?? 0,
    corpus: raw?.corpus ?? 0,
    error: raw?.error ?? 0,
  };
}

export interface SearchDemandScore {
  searches: number;
  countries: number;
}

/** Far past a night's reach; a guard against reading a runaway ledger whole. */
export const DEMAND_SCORE_LIMIT = 5000;

/** Ordered as the resolver spends, so the cap only drops a tail it never reaches. */
export async function searchDemandScores(): Promise<Map<string, SearchDemandScore>> {
  const scores = new Map<string, SearchDemandScore>();
  try {
    const demand = await getSearchDemandCollection();
    const rows = await demand
      .aggregate<{ _id: string; searches: number; countries: number }>([
        {
          $project: {
            searches: { $ifNull: ["$count", 0] },
            countries: {
              $size: { $objectToArray: { $ifNull: ["$byCountry", {}] } },
            },
          },
        },
        { $sort: { countries: -1, searches: -1 } },
        { $limit: DEMAND_SCORE_LIMIT },
      ])
      .toArray();
    for (const row of rows) {
      scores.set(row._id, {
        searches: row.searches ?? 0,
        countries: row.countries ?? 0,
      });
    }
  } catch {
    // No ledger just means the resolver orders on taps alone, as it used to.
  }
  return scores;
}
