import { getSongIndex } from "./corpusLookup";
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

// A loosely matched row only surfaces once the exact $lookup and the sort have
// already run, so the scan has to outrun the limit the caller asked for.
const WANTED_SCAN_LIMIT = 2000;

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
  // Split so the $lookup only ever runs over the rows that survive the sort
  // and the scan cap, not the whole ledger.
  const sortFields = [
    {
      $addFields: {
        countryList: { $objectToArray: { $ifNull: ["$byCountry", {}] } },
        rooms: { $size: { $ifNull: ["$rooms", []] } },
      },
    },
    { $addFields: { countryCount: { $size: "$countryList" } } },
  ];
  const withSong = [
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
  ];

  const [[totalsResult], [totalDerivedResult], [exactHitsResult], rawRows] = await Promise.all([
    demand
      .aggregate<{ totals: RawTotals[] }>([
        {
          $facet: {
            // Deliberately its own group: the gap is a share of every search,
            // not just the rows `withSong` happens to keep.
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
      .toArray(),
    demand.aggregate<{ n: number }>([...sortFields, ...withSong, { $count: "n" }]).toArray(),
    demand
      .aggregate<{ n: number }>([...withSong, { $match: { hasCuts: true } }, { $count: "n" }])
      .toArray(),
    demand
      .aggregate<RankedRow>([
        ...sortFields,
        { $sort: sort },
        { $limit: WANTED_SCAN_LIMIT },
        ...withSong,
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
      ])
      .toArray(),
  ]);

  const totalDerived = totalDerivedResult?.n ?? 0;
  const exactHits = exactHitsResult?.n ?? 0;

  // A row the exact $lookup missed can still be the corpus's song under a
  // longer key; the loose index settles that the same way an exact hit would.
  const index = await getSongIndex();
  let looseHitsInScan = 0;
  const enriched = rawRows.map((row) => {
    if (row.catalogued) return row;
    const songId = index.lookup(row.label ?? row._id);
    if (!songId) return row;
    looseHitsInScan++;
    return { ...row, catalogued: true, hasCuts: true };
  });
  const candidates = query.gapsOnly ? enriched.filter((row) => !row.hasCuts) : enriched;

  // Beyond the scan cap, a loosely matched gap can't be told from a real one,
  // so a row the scan never reached is counted as a gap until proven otherwise.
  const matched = query.gapsOnly
    ? Math.max(totalDerived - exactHits - looseHitsInScan, 0)
    : totalDerived;

  return {
    totals: emptyTotals(totalsResult?.totals?.[0]),
    rows: candidates.slice(0, limit).map(wantedRowFrom),
    matched,
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
  const countryCodes = new Map<string, Set<string>>();
  // A down index still leaves the ledger readable: every row just keys on
  // itself, as it did before the loose index existed.
  const index = await getSongIndex().catch(() => null);
  try {
    const demand = await getSearchDemandCollection();
    const rows = await demand
      .aggregate<{ _id: string; label?: string; searches: number; countryCodes: string[] }>([
        {
          $project: {
            label: 1,
            searches: { $ifNull: ["$count", 0] },
            countryCodes: {
              $map: {
                input: { $objectToArray: { $ifNull: ["$byCountry", {}] } },
                in: "$$this.k",
              },
            },
          },
        },
        { $addFields: { countryCount: { $size: "$countryCodes" } } },
        { $sort: { countryCount: -1, searches: -1 } },
        { $limit: DEMAND_SCORE_LIMIT },
      ])
      .toArray();
    for (const row of rows) {
      // Folds a short and a long phrasing of one song onto a single key.
      const key = index?.lookup(row.label ?? row._id) ?? row._id;
      const codes = countryCodes.get(key) ?? new Set<string>();
      for (const code of row.countryCodes ?? []) codes.add(code);
      countryCodes.set(key, codes);
      scores.set(key, {
        searches: (scores.get(key)?.searches ?? 0) + (row.searches ?? 0),
        countries: codes.size,
      });
    }
  } catch {
    // No ledger just means the resolver orders on taps alone, as it used to.
  }
  return scores;
}
