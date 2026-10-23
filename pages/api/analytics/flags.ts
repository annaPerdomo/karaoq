import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import {
  FLAG_DEFAULTS,
  invalidateFlagCache,
  type FlagName,
} from "../../../lib/featureFlags";
import { getFeatureFlagsCollection } from "../../../lib/mongodb";

const FLAG_NAMES = Object.keys(FLAG_DEFAULTS) as FlagName[];

function isFlagName(value: unknown): value is FlagName {
  return typeof value === "string" && FLAG_NAMES.indexOf(value as FlagName) >= 0;
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
    const collection = await getFeatureFlagsCollection();
    const docs = await collection.find({}).toArray();
    const byId = new Map(docs.map((doc) => [doc._id, doc]));
    const flags = FLAG_NAMES.map((name) => {
      const doc = byId.get(name);
      const enabled =
        doc && typeof doc.enabled === "boolean" ? doc.enabled : FLAG_DEFAULTS[name];
      return { name, enabled };
    });
    res.status(200).json({ flags });
    return;
  }

  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!parsed || typeof parsed !== "object") throw new Error();
      body = parsed;
    } catch {
      res.status(400).json({ code: 400, message: "Invalid JSON body." });
      return;
    }

    const { name, enabled, note } = body;
    if (!isFlagName(name) || typeof enabled !== "boolean") {
      res.status(400).json({ code: 400, message: "Invalid request." });
      return;
    }

    const collection = await getFeatureFlagsCollection();
    await collection.updateOne(
      { _id: name },
      {
        $set: {
          enabled,
          updatedAt: new Date(),
          ...(typeof note === "string" ? { note } : {}),
        },
      },
      { upsert: true }
    );
    invalidateFlagCache();
    res.status(200).json({ code: 200, message: "Updated." });
    return;
  }

  res.status(405).json({ code: 405, message: "Method not allowed." });
}
