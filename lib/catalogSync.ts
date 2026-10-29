import type { AnyBulkWriteOperation } from "mongodb";

import { getKaraokeSongsCollection, type KaraokeSongDoc } from "./mongodb";
import { songIdentityFromCatalog } from "./songCorpus";
import { catalogEntry, suggestionCatalog } from "./suggestionCatalog";

// The one-off migration (lib/corpusMigration) seeded karaoke_songs from the
// packs once, so a song added to a pack later never reached the corpus: its
// row rendered but every tap bought a live search. This runs every night and
// seeds whatever the catalog holds that the corpus doesn't, cutless, for the
// resolver to fill. Our own rows, no units.

export interface CatalogSyncReport {
  catalog: number;
  seeded: number;
}

const PAGE = 500;

export async function syncCatalog(): Promise<{ done: boolean; report: CatalogSyncReport }> {
  const keys = Array.from(suggestionCatalog().keys());
  const songs = await getKaraokeSongsCollection();
  const held = new Set<string>();
  for (let i = 0; i < keys.length; i += PAGE) {
    const rows = await songs
      .find({ _id: { $in: keys.slice(i, i + PAGE) } }, { projection: { _id: 1 } })
      .toArray();
    rows.forEach((row) => held.add(row._id));
  }

  const missing = keys.filter((key) => !held.has(key));
  const report = { catalog: keys.length, seeded: 0 };
  if (missing.length === 0) return { done: true, report };

  const ops: AnyBulkWriteOperation<KaraokeSongDoc>[] = missing.map((key) => {
    const { _id, ...identity } = songIdentityFromCatalog(catalogEntry(key)!);
    return {
      updateOne: {
        filter: { _id },
        // $setOnInsert only, as the migration: an add's own upsert may win the race.
        update: {
          $setOnInsert: { ...identity, cuts: [], addCount: 0, addsByCountry: {}, demand: 0 },
        },
        upsert: true,
      },
    };
  });
  const written = await songs.bulkWrite(ops, { ordered: false });
  report.seeded = written.upsertedCount;
  return { done: true, report };
}
