import { getBlockedVideosCollection } from "./mongodb";

/** blockedAt is re-stamped, so the TTL's re-test dates from the last failure.
 *  Counted: callers report this as "tombstoned this run", and a second purge
 *  pass reporting 0 reads as a bug rather than as work already done. */
export async function blockVideos(ids: string[], reason: string): Promise<number> {
  if (ids.length === 0) return 0;
  const blocked = await getBlockedVideosCollection();
  const blockedAt = new Date();
  try {
    const written = await blocked.bulkWrite(
      ids.map((id) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { reason, blockedAt } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    return written.upsertedCount + written.modifiedCount;
  } catch (e: any) {
    // Tonight's tombstone is one the next sweep writes again; losing the rest of
    // the run over it costs more. Unordered, so the ops before the failing one
    // landed and the driver hangs their counts off the error.
    console.warn("Video blocklist write partly failed:", e?.message);
    const partial = e?.result;
    return (partial?.upsertedCount ?? 0) + (partial?.modifiedCount ?? 0);
  }
}

/** The claim step's scan is env-tunable and arrives whole, so the $in needs a
 *  bound of its own — as the cut lookup in songCorpus has. */
const LOOKUP_BATCH = 1000;

export async function filterBlockedIds(ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  const blocked = await getBlockedVideosCollection();
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) {
    const rows = await blocked
      .find(
        { _id: { $in: ids.slice(i, i + LOOKUP_BATCH) } },
        { projection: { _id: 1 } }
      )
      .toArray();
    for (const row of rows) found.add(row._id);
  }
  return found;
}
