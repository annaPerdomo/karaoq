import { MongoClient } from 'mongodb';

// Must match full.mjs's search query exactly — it's the cache key this seeds.
export const SEED_QUERY = 'mr brightside';
export const SEED_VIDEO_ID = 'QASEEDVIDEO';

// Reimplements lib/searchQuery.ts + pages/api/search.ts's cache-key folding
// rather than importing those TS modules into a plain Node script.
function cacheKeyFor(query, duration, sortBy) {
  const normalized = query.trim().replace(/\s+/g, ' ');
  const folded = normalized
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return `${folded}|${duration}|${sortBy}`;
}

export async function seedSearchCache({ uri, dbName }) {
  if (dbName === 'karaoq') {
    throw new Error('seed-ci: refusing to seed the production database "karaoq"');
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const key = cacheKeyFor(SEED_QUERY, 'any', 'relevance');
    await db.collection('search_cache').updateOne(
      { key },
      {
        $set: {
          key,
          results: [
            {
              title: 'Mr. Brightside (QA seed)',
              thumbnailUrl: 'https://i.ytimg.com/vi/QASEEDVIDEO/hqdefault.jpg',
              videoId: SEED_VIDEO_ID,
              durationSeconds: 222,
              viewCount: 1,
            },
          ],
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    return key;
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  if (!uri || !dbName) {
    console.error('usage: MONGODB_URI=... MONGODB_DB=... node tests/e2e/seed-ci.mjs');
    process.exit(1);
  }
  seedSearchCache({ uri, dbName })
    .then((key) => {
      console.log(`seed-ci: wrote search_cache entry for key "${key}"`);
    })
    .catch((e) => {
      console.error('seed-ci:', e.message || e);
      process.exit(1);
    });
}
