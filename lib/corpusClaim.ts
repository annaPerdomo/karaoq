import {
  getKaraokeSongsCollection,
  getKaraokeVideosCollection,
  type KaraokeVideoDoc,
} from "./mongodb";
import type { SearchResult } from "./searchCache";
import { entryForSong } from "./songEntry";
import { MAX_CUTS, recordHarvestMatches } from "./songCorpus";
import { matchHarvestToCatalog } from "./suggestionMatch";
import { filterBlockedIds } from "./videoBlocklist";
import type { HarvestedVideo } from "./karaokeChannels";

// A song approved into a pack, or promoted from demand (lib/corpusPromote),
// gets an empty karaoke_songs doc, and the resolver buys cuts for it out of
// the day's hundred — while rows an add or a paid search already banked sit
// unclaimed a collection away. This runs the harvest matcher over those, so
// every song it fills is one the resolver no longer has to.

/** A guard against an unbounded read; the banked set is far smaller. */
export const CLAIM_SCAN_LIMIT = 3000;

export interface ClaimStepReport {
  wanted: number;
  scanned: number;
  matched: number;
  songsFilled: number;
  videosRefreshed: number;
}

function harvested(video: KaraokeVideoDoc): HarvestedVideo {
  return {
    videoId: video._id,
    title: video.title ?? "",
    thumbnailUrl: video.thumbnailUrl ?? "",
    channel: "",
  };
}

/** Kept as held, so a claim doesn't blank what a paid call bought. */
function detail(video: KaraokeVideoDoc): SearchResult {
  return {
    videoId: video._id,
    title: video.title ?? "",
    thumbnailUrl: video.thumbnailUrl ?? "",
    ...(video.durationSeconds !== undefined
      ? { durationSeconds: video.durationSeconds }
      : {}),
    ...(video.viewCount !== undefined ? { viewCount: video.viewCount } : {}),
  };
}

export async function claimBankedVideos(
  deadline: number,
  limit: number = CLAIM_SCAN_LIMIT
): Promise<{ done: boolean; report: ClaimStepReport }> {
  const report: ClaimStepReport = {
    wanted: 0,
    scanned: 0,
    matched: 0,
    songsFilled: 0,
    videosRefreshed: 0,
  };
  if (Date.now() >= deadline) return { done: false, report };

  const songs = await getKaraokeSongsCollection();
  // Unordered on purpose: the matcher takes all of them at once, so this is not
  // a queue a ranking could improve.
  const wanted = await songs
    .find(
      { cuts: [], retired: { $ne: true } },
      { projection: { _id: 1, title: 1, artist: 1, nativeTitle: 1, nativeArtist: 1, origin: 1 } }
    )
    .toArray();
  report.wanted = wanted.length;
  if (wanted.length === 0) return { done: true, report };

  const entries = wanted.map((song) => entryForSong(song));

  const videos = await getKaraokeVideosCollection();
  // Newest first because of the cap: unsorted, the filter's collection scan hands
  // back the oldest rows, which are the ones nothing has ever matched.
  const unclaimed = await videos
    .find(
      {
        $or: [{ songKeys: { $exists: false } }, { songKeys: { $size: 0 } }],
      },
      { projection: { title: 1, thumbnailUrl: 1, durationSeconds: 1, viewCount: 1 } }
    )
    .sort({ refreshedAt: -1 })
    .limit(limit)
    .toArray();
  report.scanned = unclaimed.length;
  if (unclaimed.length === 0) return { done: true, report };

  if (Date.now() >= deadline) return { done: false, report };

  // Nothing here re-reads the video, so a tombstoned one files on a title alone.
  const blocked = await filterBlockedIds(unclaimed.map((video) => video._id));
  const banked = unclaimed.filter((video) => !blocked.has(video._id));

  const matches = matchHarvestToCatalog(
    banked.map(harvested),
    entries,
    MAX_CUTS
  );
  matches.forEach((rows) => {
    report.matched += rows.length;
  });
  if (matches.size === 0) return { done: report.scanned < limit, report };

  const details = new Map<string, SearchResult>(
    banked.map((video) => [video._id, detail(video)] as [string, SearchResult])
  );
  const written = await recordHarvestMatches(matches, details, "claim");
  report.songsFilled = written.songsFilled;
  report.videosRefreshed = written.videosRefreshed;

  return { done: report.scanned < limit, report };
}
