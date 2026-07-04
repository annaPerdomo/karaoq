import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, Room } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

const REACTION_TTL_MS = 30000;

// A display heartbeats every ~10s from a Web Worker (immune to background-tab
// timer throttling). The window is still sized to survive a worst-case
// once-per-minute throttled beat, so a hidden-but-playing display is never
// mistaken for a dead one.
const DISPLAY_LIVE_MS = 75_000;
// After the host presses play, give a display this long to load and start
// heartbeating before treating the playback as orphaned.
const PLAY_GRACE_MS = 15_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Room | ApiError>
) {
  const roomId = normalizeRoomId(req.query.id);

  if (typeof roomId !== "string") {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  try {
    const collection = await getRoomsCollection();

    if (req.method === "POST") {
      const isCustom = req.headers["x-custom-code"] === "1";
      const existing = await collection.findOne({ id: roomId });
      if (existing && isCustom) {
        // Custom code already taken — tell the client to pick another
        res.status(409).json({ code: 409, message: "Room code already in use." });
      } else if (existing) {
        // Only reset play state when the device that was PLAYING the current
        // song reconnects (its stored token matches the room's) — that page
        // was the playback surface, so the song died with it. Any other host
        // connecting (second device, co-host promotion, new phone) must never
        // cut what's already playing. TV rooms never reset: playback lives on
        // the display, not on whichever host page just loaded.
        const priorToken = req.headers["x-play-token"];
        const ownerReturned =
          existing.playMode !== "tv" &&
          (existing.isPlaying ?? false) &&
          typeof priorToken === "string" &&
          priorToken.length > 0 &&
          existing.playToken === priorToken;
        if (ownerReturned) {
          await collection.updateOne(
            { id: roomId },
            {
              $set: { isPlaying: false, lastActivity: new Date() },
              $unset: { playToken: "", displayPaused: "", playStartedAt: "" },
            }
          );
          res.status(200).json({ ...existing, isPlaying: false });
        } else {
          await collection.updateOne(
            { id: roomId },
            { $set: { lastActivity: new Date() } }
          );
          res.status(200).json(existing);
        }
      } else if (!rateLimit(req, "room-create", 10, 300_000)) {
        res.status(429).json({ code: 429, message: "Too many rooms created, try again later." });
      } else {
        const now = new Date();
        const room: Room = {
          id: roomId,
          queue: [],
          activeVideoIndex: 0,
          isPlaying: false,
          reactionsEnabled: true,
          // Matches the host UI default; switching to a separate screen
          // updates it via the mode endpoint.
          playMode: "here",
          createdAt: now,
          lastActivity: now,
        };
        await collection.insertOne(room);
        trackEvent(req, "room_created", { roomId });
        res.status(201).json(room);
      }
    } else if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const room = await collection.findOne({ id: roomId });
      if (room) {
        const now = Date.now();
        const displayConnected = !!(
          room.displayLastSeen &&
          now - new Date(room.displayLastSeen).getTime() < DISPLAY_LIVE_MS
        );

        // Self-heal orphaned playback: a TV room can't really be playing with
        // no live display. Without this, a dead display session leaves the
        // host showing a stop button for a song that isn't playing anywhere.
        // (Here-mode rooms are exempt — their player is a host page. Reads
        // from a display page are exempt too: they are living proof a display
        // exists, and a display must never heal-stop its own playback.)
        const isDisplayReader = req.query.display === "1";
        let isPlaying = room.isPlaying ?? false;
        if (isPlaying && !isDisplayReader && room.playMode !== "here" && !displayConnected) {
          const playAge = room.playStartedAt
            ? now - new Date(room.playStartedAt).getTime()
            : Infinity;
          if (playAge > PLAY_GRACE_MS) {
            await collection.updateOne(
              { id: roomId, isPlaying: true },
              {
                $set: { isPlaying: false },
                $unset: { playToken: "", displayPaused: "", playStartedAt: "" },
              }
            );
            isPlaying = false;
          }
        }

        // Filter stale reactions in-memory only — persisting the cleanup here
        // would turn every poll into a write. The reactions POST route prunes
        // the stored array whenever a new reaction comes in.
        const reactions = (room.reactions ?? []).filter(
          (r) => now - r.timestamp < REACTION_TTL_MS
        );
        res.status(200).json({
          ...room,
          isPlaying,
          displayConnected,
          reactionsEnabled: room.reactionsEnabled ?? true,
          reactions,
        });
      } else {
        res.status(404).json({ code: 404, message: "Not found." });
      }
    } else {
      res.status(405).json({ code: 405, message: "Method not allowed." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
