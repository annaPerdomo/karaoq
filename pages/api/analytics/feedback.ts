import { NextApiRequest, NextApiResponse } from "next";
import { ObjectId, type Filter } from "mongodb";

import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { getFeedbackCollection } from "../../../lib/mongodb";
import { FEEDBACK_KINDS, type FeedbackEntry } from "../types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// The filter must run in the query: filtering the returned page instead hides
// older matches behind rows that were already paged past.
function buildFilter(query: NextApiRequest["query"]): Filter<FeedbackEntry> {
  const filter: Filter<FeedbackEntry> = {};
  if (query.handled === "false") filter.handled = false;
  else if (query.handled === "true") filter.handled = true;
  const kind = query.kind as string;
  if (FEEDBACK_KINDS.includes(kind as never)) {
    filter.kind = kind as FeedbackEntry["kind"];
  }
  return filter;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "GET") {
    const skip = Math.max(0, parseInt(req.query.skip as string, 10) || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT)
    );

    try {
      const collection = await getFeedbackCollection();
      const [docs, unhandled] = await Promise.all([
        collection
          .find(buildFilter(req.query))
          .sort({ createdAt: -1 })
          .skip(skip)
          // One extra row is the has-more probe, same as /api/analytics/rooms.
          .limit(limit + 1)
          .toArray(),
        // Every write sets `handled`, so this equals `$ne: true` but indexes.
        collection.countDocuments({ handled: false }),
      ]);

      const hasMore = docs.length > limit;
      res.status(200).json({
        items: docs.slice(0, limit).map((d) => ({ ...d, _id: String(d._id) })),
        hasMore,
        unhandled,
      });
    } catch (e) {
      console.error("Feedback read error:", e);
      res.status(500).json({ code: 500, message: "Could not load feedback." });
    }
    return;
  }

  if (req.method === "PATCH") {
    let body: { id?: string; handled?: boolean };
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") throw new Error();
    } catch {
      res.status(400).json({ code: 400, message: "Invalid JSON body." });
      return;
    }

    if (
      typeof body.id !== "string" ||
      !ObjectId.isValid(body.id) ||
      typeof body.handled !== "boolean"
    ) {
      res.status(400).json({ code: 400, message: "Invalid request." });
      return;
    }

    const handled = body.handled;
    try {
      const collection = await getFeedbackCollection();
      await collection.updateOne(
        { _id: new ObjectId(body.id) },
        { $set: { handled } }
      );
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error("Feedback update error:", e);
      res.status(500).json({ code: 500, message: "Could not update feedback." });
    }
    return;
  }

  res.status(405).json({ code: 405, message: "Method not allowed." });
}
