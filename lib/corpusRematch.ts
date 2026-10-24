import { getCronStateCollection, getKaraokeSongsCollection } from "./mongodb";
import { isProductionDeploy } from "./platform";

// The matcher once demanded every act of a group credit and couldn't read CJK
// titles without spaces, so real songs missed and were backed off for weeks
// (lib/songCorpus markResolveMiss) — promoted ones retired outright. Once, on
// the first production run after the fix, every cutless song with a miss gets
// a fresh try. Guarded like repair-demand-v2: dev shares prod's database.

export const REMATCH_ID = "rematch-v1";

export interface RematchReport {
  reset: number;
  skipped?: true | "not production";
}

export async function rematchMissedSongs(): Promise<{ done: boolean; report: RematchReport }> {
  if (!isProductionDeploy()) return { done: true, report: { reset: 0, skipped: "not production" } };

  const state = await getCronStateCollection();
  if ((await state.findOne({ _id: REMATCH_ID }))?.done) {
    return { done: true, report: { reset: 0, skipped: true } };
  }

  const songs = await getKaraokeSongsCollection();
  const { modifiedCount } = await songs.updateMany(
    // A retired pack song can't exist (only promoted songs retire), so origin
    // needn't be checked.
    { "cuts.0": { $exists: false }, resolveMisses: { $gt: 0 } },
    { $unset: { resolveMisses: "", nextResolveAt: "", retired: "" } }
  );
  await state.updateOne(
    { _id: REMATCH_ID },
    { $set: { done: true, updatedAt: new Date() } },
    { upsert: true }
  );
  return { done: true, report: { reset: modifiedCount } };
}
