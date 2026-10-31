import { NextApiRequest, NextApiResponse } from "next";
import type { Document } from "mongodb";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { LOGO_STORE_BUDGET_BYTES } from "../../../lib/limits";
import {
  getAnalyticsDb,
  getFeedbackCollection,
  getRoomLogosCollection,
} from "../../../lib/mongodb";
import { logoStoreBytes } from "../../../lib/roomLogos";
import {
  BRAND_EVENTS,
  type BrandRow,
  featureRooms,
  type FeedbackRow,
  MUSIC_VIDEO_EVENTS,
  type MusicVideoRow,
  pickFeatureFeedback,
  summarizeBrand,
  summarizeMusicVideo,
  windowDays,
  windowStart,
} from "../../../lib/screensStats";
import {
  SCREENS_WINDOWS,
  type ScreensStats,
} from "../../../components/admin/screens/types";

const DEFAULT_DAYS = 30;
// The feature filter runs after this cap: with more than 1,000 feedback entries
// in the window, older matches are dropped.
const FEEDBACK_SCAN = 1000;

function parseDays(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return DEFAULT_DAYS;
  if (typeof raw !== "string") return null;
  const match = SCREENS_WINDOWS.filter((d) => String(d) === raw);
  return match.length === 1 ? match[0] : null;
}

async function eventRows<T extends Document>(types: readonly string[], since: Date, fields: string[]): Promise<T[]> {
  const db = await getAnalyticsDb();
  const project: Record<string, 0 | 1> = { _id: 0, type: 1, roomId: 1 };
  for (const field of fields) project[field] = 1;
  return db
    .collection("analytics_events")
    .aggregate<T>([
      { $match: { type: { $in: types }, timestamp: { $gte: since } } },
      { $project: project },
    ])
    .toArray();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  const days = parseDays(req.query.days);
  if (days === null) {
    res.status(400).json({ code: 400, message: "days must be 7, 30 or 90." });
    return;
  }

  try {
    const now = Date.now();
    const since = windowStart(days, now);
    const [musicRows, brandRows, storageBytes, committedLogos, feedbackRows] =
      await Promise.all([
        eventRows<MusicVideoRow>(MUSIC_VIDEO_EVENTS, since, [
          "timestamp",
          "source",
          "found",
          "durationSeconds",
          "songsShown",
          "songsUnavailable",
          "code",
          "offsetSeconds",
          "action",
        ]),
        eventRows<BrandRow>(BRAND_EVENTS, since, ["logo", "colors", "cleared", "surface", "reason"]),
        logoStoreBytes(),
        getRoomLogosCollection().then((c) =>
          c.countDocuments({ expireAt: { $exists: false } })
        ),
        getFeedbackCollection().then((c) =>
          c
            .find(
              { createdAt: { $gte: since } },
              { projection: { _id: 1, createdAt: 1, kind: 1, message: 1, page: 1, roomId: 1 } }
            )
            .sort({ createdAt: -1 })
            .limit(FEEDBACK_SCAN)
            .toArray()
        ),
      ]);

    const rooms = featureRooms((musicRows as { roomId?: string }[]).concat(brandRows));
    const data: ScreensStats = {
      days,
      musicVideo: summarizeMusicVideo(musicRows, windowDays(days, now)),
      brand: summarizeBrand(brandRows, {
        storageBytes,
        storageBudgetBytes: LOGO_STORE_BUDGET_BYTES,
        committedLogos,
      }),
      feedback: pickFeatureFeedback(feedbackRows as unknown as FeedbackRow[], rooms),
    };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json(data);
  } catch (e) {
    console.error("Screens stats read failed:", e);
    res.status(500).json({ code: 500, message: "Failed to read screen stats." });
  }
}
