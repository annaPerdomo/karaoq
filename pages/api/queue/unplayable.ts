import { NextApiRequest, NextApiResponse } from "next";
import { rateLimit } from "../../../lib/limits";
import { normalizeRoomId } from "../../../lib/roomCode";
import { UNPLAYABLE_PLAYER_CODES } from "../../../lib/playbackCodes";
import { VIDEO_ID_RE } from "../../../lib/videoLink";
import { blockVideos, filterBlockedIds } from "../../../lib/videoBlocklist";
import { recordSpend } from "../../../lib/corpusBudget";
import { getRoomsCollection } from "../../../lib/mongodb";
import { dropVideos } from "../../../lib/songCorpus";
import { pruneCachedVideos } from "../../../lib/searchCache";
import { fetchVideoRows } from "../../../lib/youtubeVideos";

/**
 * Reported by the embedded player when YouTube refuses to play a video. Never
 * taken at its word: a videos.list call (1 unit, against the 10,000/day pool
 * rather than search's 100) has to confirm the video is unembeddable or gone
 * before anything is tombstoned. A well-formed report always answers 200.
 *
 * Anonymous like the rest of /api/queue, so the room guard is what bounds that
 * spend by what rooms have queued rather than by how fast a client can POST.
 * Spending the 10,000 ends search for every room until midnight Pacific.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const body = (req.body ?? {}) as {
    roomId?: unknown;
    videoId?: unknown;
    code?: unknown;
  };
  const { videoId, code } = body;
  const roomId = normalizeRoomId(
    typeof body.roomId === "string" ? body.roomId : undefined
  );

  if (typeof roomId !== "string" || roomId.length === 0) {
    res.status(400).json({ code: 400, message: "Missing or invalid room id." });
    return;
  }

  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId)) {
    res.status(400).json({ code: 400, message: "Missing or invalid video id." });
    return;
  }

  if (typeof code !== "number" || UNPLAYABLE_PLAYER_CODES.indexOf(code) < 0) {
    res.status(400).json({ code: 400, message: "Missing or invalid error code." });
    return;
  }

  // A room reports once per failing song; hitting this is someone leaning on it.
  if (!rateLimit(req, "unplayable", 10, 60_000)) {
    res.status(429).json({ code: 429, message: "Too many reports, slow down." });
    return;
  }

  try {
    const rooms = await getRoomsCollection();
    const room = await rooms.findOne(
      { id: roomId, "queue.videoId": videoId },
      { projection: { _id: 1 } }
    );
    if (!room) {
      res.status(404).json({ code: 404, message: "Not queued in that room." });
      return;
    }

    // Every room queued on a dead video reports it, and a refresh re-arms the
    // player's once-guard: re-verifying spends a lookup on a settled question.
    const known = await filterBlockedIds([videoId]);
    if (known.has(videoId)) {
      // Tombstoned does not mean unfiled — a cut filed before the video was
      // blocked outlives it — and both writes are idempotent.
      await unfile(videoId);
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
    await recordSpend(Date.now(), { lookups: 1 }).catch(() => {});
    // Null is "couldn't ask" — a YouTube outage must not empty the corpus.
    const confirmed =
      !!found &&
      (found.unembeddable.indexOf(videoId) >= 0 || !found.rows.has(videoId));

    if (confirmed) {
      console.warn(`Unplayable video confirmed: ${videoId} (player code ${code})`);
      await Promise.all([
        blockVideos([videoId], "playback_failed"),
        unfile(videoId),
      ]);
    }

    res
      .status(200)
      .json({ code: 200, message: "Report recorded.", tombstoned: confirmed });
  } catch (e: any) {
    console.warn("Unplayable report failed:", e?.message);
    res.status(200).json({ code: 200, message: "Report recorded.", tombstoned: false });
  }
}

function unfile(videoId: string): Promise<unknown> {
  return Promise.all([dropVideos([videoId]), pruneCachedVideos([videoId])]);
}
