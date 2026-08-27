import { getSearchDemandCollection } from "./mongodb";

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
