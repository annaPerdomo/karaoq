import { pinTopFirst, type ResolvedResult } from "./corpusRead";
import { getSuggestionVideosCollection } from "./mongodb";
import type { SearchResult } from "./searchCache";

// Sources fill entries unequally — a search buys fifty rows, the harvest a
// handful, a human's pick one — so below this an entry stays stored but doesn't
// serve: the tap falls through to a search whose results overwrite it.
export const THIN_RESULTS = 10;

/** Null when unresolved or too thin to answer with — the caller then searches
 *  as usual. A store failure reads as "not resolved", never as an error. */
export async function readSuggestionVideos(
  key: string
): Promise<ResolvedResult[] | null> {
  try {
    const store = await getSuggestionVideosCollection();
    const doc = await store.findOne({ _id: key });
    if (!doc || doc.results.length < THIN_RESULTS) return null;
    return pinTopFirst(doc.results, doc.topVideoId);
  } catch {
    return null;
  }
}

/** Fire-and-forget, like writeCache — a singer waiting on results must never
 *  wait on our bookkeeping. */
export function writeSuggestionVideos(key: string, results: SearchResult[]): void {
  if (results.length === 0) return;
  const now = new Date();
  getSuggestionVideosCollection()
    .then((store) =>
      store.updateOne(
        { _id: key },
        {
          $set: { results, refreshedAt: now },
          // Only on insert: this is when the *search* ran, and a later refresh
          // that spends no search must not claim otherwise.
          $setOnInsert: { resolvedAt: now },
        },
        { upsert: true }
      )
    )
    .catch(() => {});
}
