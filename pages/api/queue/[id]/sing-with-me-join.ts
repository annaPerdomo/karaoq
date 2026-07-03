import { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";
import { trackEvent } from "../../../../lib/analytics";
import { MAX_NAME_LENGTH, MAX_QUEUE_LENGTH, rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";
import type { QueueEntry } from "../../types";

// Join a "Sing with me" post. When the number of joined singers reaches
// minSingers, the song auto-adds to the queue (once); further joins up to
// maxSingers keep adding names to the on-stage credit until it plays.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  const roomId = normalizeRoomId(req.query.id);
  let body: { postId?: unknown; userName?: unknown };
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { postId, userName } = body;
  if (
    typeof roomId !== "string" ||
    typeof postId !== "string" ||
    typeof userName !== "string" ||
    userName.trim().length === 0 ||
    userName.length > MAX_NAME_LENGTH
  ) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  if (!rateLimit(req, "singwithme-join", 20, 30_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  try {
    const collection = await getRoomsCollection();
    const room = await collection.findOne({ id: roomId });
    if (!room) {
      res.status(404).json({ code: 404, message: "Room not found." });
      return;
    }

    const posts = room.singWithMe ?? [];
    const post = posts.find((p) => p.id === postId);
    if (!post) {
      res.status(404).json({ code: 404, message: "Post not found." });
      return;
    }

    if (post.joinedSingers.includes(userName)) {
      res.status(409).json({ code: 409, message: "Already joined." });
      return;
    }
    if (post.joinedSingers.length >= post.maxSingers) {
      res.status(409).json({ code: 409, message: "This song is full." });
      return;
    }

    post.joinedSingers.push(userName);

    // Auto-add to the queue the moment we hit the minimum, but only once.
    let queuedEntry: QueueEntry | null = null;
    const reachedMin = post.joinedSingers.length >= post.minSingers;
    if (reachedMin && !post.queued && room.queue.length < MAX_QUEUE_LENGTH) {
      post.queued = true;
      queuedEntry = {
        id: uuidv4(),
        userName: creditNames(post.joinedSingers),
        songTitle: `🎤 ${post.songTitle}`,
        videoId: post.videoId,
      };
    }

    const update: Record<string, unknown> = {
      singWithMe: posts,
      lastActivity: new Date(),
    };
    if (queuedEntry) {
      update.queue = [...room.queue, queuedEntry];
    }
    await collection.updateOne({ id: roomId }, { $set: update });

    trackEvent(req, "singwithme_joined", {
      roomId,
      userName,
      songTitle: post.songTitle,
      videoId: post.videoId,
    });
    if (queuedEntry) {
      trackEvent(req, "singwithme_queued", {
        roomId,
        songTitle: post.songTitle,
        videoId: post.videoId,
      });
      // Also count it as a song add so core metrics (funnel, songs/room, top
      // songs) include group songs. No userName: the group credit string
      // would pollute per-singer stats, and joins are tracked individually.
      trackEvent(req, "song_added", {
        roomId,
        songTitle: post.songTitle,
        videoId: post.videoId,
        via: "singwithme",
      });
    }

    res.status(200).json({ code: 200, message: "Joined.", queued: post.queued });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}

// Build the on-stage credit, keeping the queue entry name within its cap.
function creditNames(names: string[]): string {
  const joined = names.join(" & ");
  if (joined.length <= MAX_NAME_LENGTH) return joined;
  return `${names.length} singers`;
}
