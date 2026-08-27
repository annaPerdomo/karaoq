import type { AnyBulkWriteOperation } from "mongodb";

import { proposalSignature } from "./corpusProposals";
import { getSearchDemandCollection, type SearchDemandDoc } from "./mongodb";
import {
  buildSearchQuery,
  hasSearchOperators,
  searchCacheKey,
} from "./searchQuery";
import { countryField } from "./songCorpus";
import { songTokens } from "./suggestionMatch";

// Nothing renders as a suggestion unless we can already serve it, so `demand` on
// karaoke_songs is zero for exactly the songs the resolver exists to buy.

/** Room ids kept per query. Past this the list stops growing, so a reader takes
 *  it as "at least this many". */
export const MAX_TRACKED_ROOMS = 25;

/** Mirrors /api/search's own cap, so the lib is safe called from anywhere. */
export const MAX_DEMAND_LABEL_LENGTH = 200;

/**
 * - `served` — a cache hit answered it, no quota spent.
 * - `spent` — a live YouTube search paid for it.
 * - `stale` / `corpus` — search failed, an aging cache or the corpus covered.
 * - `error` — search failed and the singer got nothing. Unmet demand.
 */
export const SEARCH_DEMAND_OUTCOMES = [
  "served",
  "spent",
  "stale",
  "corpus",
  "error",
] as const;
export type SearchDemandOutcome = (typeof SEARCH_DEMAND_OUTCOMES)[number];

export interface SearchDemandWrite {
  query: string;
  roomId: string;
  country?: string;
  outcome: SearchDemandOutcome;
}

/** Always the karaoke-mode form, whatever the toggle was set to: this has to be
 *  the same string karaoke_songs files a song under, or a row joins nothing. */
export function demandKey(query: string): string {
  return searchCacheKey(buildSearchQuery(query, true));
}

/** An operator query folds onto a key it may have excluded — "abba dancing queen
 *  -karaoke" onto abba dancing queen — so counting it credits the wrong song. */
export function countsAsDemand(query: string): boolean {
  if (hasSearchOperators(query)) return false;
  const key = demandKey(query);
  // What pure punctuation folds to once the mode's word is appended: no song.
  return key.length > 0 && key !== "karaoke";
}

export function recordSearchDemand(write: SearchDemandWrite): Promise<void> {
  return writeSearchDemand(write).catch(() => {});
}

async function writeSearchDemand(write: SearchDemandWrite): Promise<void> {
  if (!countsAsDemand(write.query)) return;

  const key = demandKey(write.query);
  const country = countryField(write.country);
  const now = new Date();

  const inc: Record<string, number> = {
    count: 1,
    [`outcomes.${write.outcome}`]: 1,
  };
  if (country) inc[`byCountry.${country}`] = 1;

  const onInsert: Record<string, unknown> = {
    // Written once: re-deriving it would rewrite every row when the tokeniser changes.
    signature: proposalSignature(songTokens(key)),
    firstSeenAt: now,
  };
  // $inc on byCountry.XX creates the map itself, so seeding it here as well
  // would collide on the same path.
  if (!country) onInsert.byCountry = {};

  const ops: AnyBulkWriteOperation<SearchDemandDoc>[] = [
    {
      updateOne: {
        filter: { _id: key },
        update: {
          $set: {
            label: write.query.slice(0, MAX_DEMAND_LABEL_LENGTH),
            lastSeenAt: now,
          },
          $inc: inc,
          $setOnInsert: onInsert,
        },
        upsert: true,
      },
    },
  ];

  // No upsert: `ordered` runs the op above first, which has made the row. Once
  // the array is full the filter simply misses, capping the document in place.
  if (write.roomId) {
    ops.push({
      updateOne: {
        filter: {
          _id: key,
          $expr: {
            $lt: [{ $size: { $ifNull: ["$rooms", []] } }, MAX_TRACKED_ROOMS],
          },
        },
        update: { $addToSet: { rooms: write.roomId } },
      },
    });
  }

  const demand = await getSearchDemandCollection();
  await demand.bulkWrite(ops, { ordered: true });
}
