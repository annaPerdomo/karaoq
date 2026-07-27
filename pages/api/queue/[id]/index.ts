import { NextApiRequest, NextApiResponse } from "next";
import { ApiError, DEFAULT_DISPLAY_CONFIG, Room } from "../../types";
import { trackEvent } from "../../../../lib/analytics";
import { rateLimit } from "../../../../lib/limits";
import { getRoomsCollection } from "../../../../lib/mongodb";
import { normalizeRoomId } from "../../../../lib/roomCode";

const REACTION_TTL_MS = 30000;

// Also protects server-side invariants that assume well-formed ids — e.g. the analytics sessionKey
// `roomId:clientId:role`, where a ":" in a roomId would collide.
const ROOM_CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

// Displays heartbeat ~10s from a Web Worker; the window still survives a worst-case once-per-minute
// throttled beat so a hidden-but-playing display is never mistaken for a dead one.
const DISPLAY_LIVE_MS = 75_000;
// Time for a display to load and start heartbeating after play before playback counts as orphaned.
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
        res.status(409).json({ code: 409, message: "Room code already in use." });
      } else if (existing) {
        // Reset play state only when the device that was PLAYING reconnects (token match) — any
        // other host device must never cut what's playing. TV rooms never reset: playback lives on the display.
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
      } else if (!ROOM_CODE_PATTERN.test(roomId)) {
        res.status(400).json({ code: 400, message: "Invalid room code." });
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
          // Rooms created before the flag are left alone — see the GET's `?? false` backfill.
          fairMode: true,
          playMode: "here",
          displayConfig: DEFAULT_DISPLAY_CONFIG,
          createdAt: now,
          lastActivity: now,
        };
        try {
          await collection.insertOne(room);
        } catch (e) {
          // The findOne above raced the unique index. The client only maps 409 to "code in use",
          // so a raw E11000 500 would read as a server failure.
          if ((e as { code?: number })?.code === 11000) {
            if (isCustom) {
              res.status(409).json({ code: 409, message: "Room code already in use." });
              return;
            }
            // Random-code path: just join the room the winning create made.
            const winner = await collection.findOne({ id: roomId });
            if (winner) {
              await collection.updateOne(
                { id: roomId },
                { $set: { lastActivity: new Date() } }
              );
              res.status(200).json(winner);
              return;
            }
          }
          throw e;
        }
        // Awaited: the response freezes the serverless instance, and an in-flight insert dies with
        // it. Fire-and-forget was silently losing room_created events, which the whole activation
        // funnel counts from.
        await trackEvent(req, "room_created", { roomId, fairMode: room.fairMode });
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

        // Self-heal orphaned playback: a TV room can't be playing with no live display. Here-mode
        // rooms are exempt (their player is a host page); display readers are exempt — a display must never heal-stop its own playback.
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

        // In-memory filter only — persisting the cleanup would turn every poll into a write; the
        // reactions POST route prunes the stored array.
        const reactions = (room.reactions ?? []).filter(
          (r) => now - r.timestamp < REACTION_TTL_MS
        );
        res.status(200).json({
          ...room,
          isPlaying,
          displayConnected,
          reactionsEnabled: room.reactionsEnabled ?? true,
          // Absent = the room predates the flag. Those stay OFF even though new rooms default ON:
          // their queue was never sorted, so reporting "on" would show a fair badge over a first-come order.
          fairMode: room.fairMode ?? false,
          displayConfig: room.displayConfig ?? DEFAULT_DISPLAY_CONFIG,
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
