import { NextApiRequest, NextApiResponse } from "next";

import { localeFromRequest } from "../../lib/analytics";
import { getFeedbackCollection } from "../../lib/mongodb";
import {
  MAX_STORED_UA_LENGTH,
  rateLimit,
  sanitizeFeedback,
} from "../../lib/limits";
import type { FeedbackEntry } from "./types";

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const feedback = sanitizeFeedback(body);
  if (!feedback) {
    res.status(400).json({ code: 400, message: "Invalid request." });
    return;
  }

  // Deliberately tight: a handful per window is generous for a real person
  // sending considered feedback, and useless to a spammer.
  if (!rateLimit(req, "feedback", 5, 10 * 60_000)) {
    res.status(429).json({ code: 429, message: "Too fast, slow down." });
    return;
  }

  const locale = localeFromRequest(req);
  const country = headerString(req.headers["x-vercel-ip-country"]);
  const userAgent = headerString(req.headers["user-agent"])?.slice(
    0,
    MAX_STORED_UA_LENGTH
  );
  const entry: FeedbackEntry = {
    kind: feedback.kind,
    message: feedback.message,
    contact: feedback.contact,
    // Spread only when present: an explicit null reads as "no room" rather
    // than "not from a room".
    ...(feedback.roomId ? { roomId: feedback.roomId } : {}),
    ...(feedback.role ? { role: feedback.role } : {}),
    ...(feedback.page ? { page: feedback.page } : {}),
    ...(locale ? { locale } : {}),
    ...(country ? { country } : {}),
    ...(userAgent ? { userAgent } : {}),
    handled: false,
    createdAt: new Date(),
  };

  try {
    const collection = await getFeedbackCollection();
    await collection.insertOne(entry);
  } catch (e) {
    // Awaited and surfaced, unlike analytics: someone is watching the form and
    // needs to know their report didn't land.
    console.error("Feedback write error:", e);
    res.status(500).json({ code: 500, message: "Could not save feedback." });
    return;
  }

  res.status(200).json({ ok: true });
}
