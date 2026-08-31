import { NextApiRequest, NextApiResponse } from "next";
import { rateLimit } from "../../../lib/limits";
import { VIDEO_ID_RE } from "../../../lib/videoLink";
import { blockVideos, filterBlockedIds } from "../../../lib/videoBlocklist";
import { dropVideos } from "../../../lib/songCorpus";
import { pruneCachedVideos } from "../../../lib/searchCache";
import { fetchVideoRows } from "../../../lib/youtubeVideos";

// 101/150 are the owner disabling embedding, 100 a video gone or private. Any
// other code says nothing about the video and must not spend a lookup.
const REPORTED_CODES = [100, 101, 150];

/**
 * Reported by the embedded player when YouTube refuses to play a video. Never
 * taken at its word: a videos.list call (1 unit, against the 10,000/day pool
 * rather than search's 100) has to confirm the video is unembeddable or gone
 * before anything is tombstoned. A well-formed report always answers 200.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const { videoId, code } = (req.body ?? {}) as {
    videoId?: unknown;
    code?: unknown;
  };

  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId)) {
    res.status(400).json({ code: 400, message: "Missing or invalid video id." });
    return;
  }

  if (typeof code !== "number" || REPORTED_CODES.indexOf(code) < 0) {
    res.status(400).json({ code: 400, message: "Missing or invalid error code." });
    return;
  }

  // A room reports once per failing song; hitting this is someone leaning on it.
  if (!rateLimit(req, "unplayable", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many reports, slow down." });
    return;
  }

  try {
    // Every room queued on a dead video reports it, and a refresh re-arms the
    // player's once-guard: re-verifying spends a lookup on a settled question.
    const known = await filterBlockedIds([videoId]);
    if (known.has(videoId)) {
      res.status(200).json({ code: 200, message: "Report recorded.", tombstoned: true });
      return;
    }

    const key = process.env.YOUTUBE_API_KEY;
    // Unverifiable is not confirmed: this would be tombstoning on hearsay.
    if (!key) {
      res.status(200).json({ code: 200, message: "Report recorded.", tombstoned: false });
      return;
    }

    const found = await fetchVideoRows([videoId], key);
    // Null is "couldn't ask" — a YouTube outage must not empty the corpus.
    const confirmed =
      !!found &&
      (found.unembeddable.indexOf(videoId) >= 0 || !found.rows.has(videoId));

    if (confirmed) {
      console.warn(`Unplayable video confirmed: ${videoId} (player code ${code})`);
      await blockVideos([videoId], "playback_failed");
      await dropVideos([videoId]);
      await pruneCachedVideos([videoId]);
    }

    res
      .status(200)
      .json({ code: 200, message: "Report recorded.", tombstoned: confirmed });
  } catch (e: any) {
    console.warn("Unplayable report failed:", e?.message);
    res.status(200).json({ code: 200, message: "Report recorded.", tombstoned: false });
  }
}
