import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import {
  PROMOTE_MIN_COUNTRIES,
  PROMOTE_MIN_ROOMS,
  approveProposal,
  parseIdentityOverride,
  pickIdentity,
  qualifies,
  rejectProposal,
} from "../../../lib/corpusPromote";
import { getSongProposalsCollection, type SongProposalDoc } from "../../../lib/mongodb";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type View = "pending" | "promoted" | "rejected" | "unnamed";

function filterFor(view: View): Record<string, unknown> {
  switch (view) {
    case "promoted":
      return { promoteOutcome: "promoted", status: { $ne: "rejected" } };
    case "rejected":
      return { status: "rejected" };
    case "unnamed":
      return { promoteOutcome: "unnamed", status: { $ne: "rejected" } };
    default:
      return {
        promoteOutcome: { $exists: false },
        promotedSongId: { $exists: false },
        status: { $exists: false },
      };
  }
}

function countriesFor(p: SongProposalDoc): string[] {
  return Array.from(
    new Set([
      ...Object.keys(p.addsByCountry ?? {}),
      ...Object.keys(p.searchesByCountry ?? {}),
    ])
  );
}

function toRow(p: SongProposalDoc) {
  return {
    id: p._id,
    label: p.label,
    candidates: p.candidates,
    picked: pickIdentity(p),
    rooms: p.rooms,
    searchRooms: p.searchRooms ?? 0,
    countries: countriesFor(p),
    addCount: p.addCount,
    searchCount: p.searchCount ?? 0,
    videoIds: p.videoIds.slice(0, 3),
    qualifies: qualifies(p),
    ...(p.promotedSongId ? { promotedSongId: p.promotedSongId } : {}),
    ...(p.status ? { status: p.status } : {}),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function handleGet(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const queryView = req.query.view;
  const view: View =
    queryView === "promoted" || queryView === "rejected" || queryView === "unnamed"
      ? queryView
      : "pending";
  const parsed = Number(req.query.limit);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT)
  );

  const proposals = await getSongProposalsCollection();
  const rows = await proposals
    .find(filterFor(view))
    .sort({ rooms: -1, addCount: -1 })
    .limit(limit)
    .toArray();

  res.status(200).json({
    rows: rows.map(toRow),
    thresholds: { minRooms: PROMOTE_MIN_ROOMS, minCountries: PROMOTE_MIN_COUNTRIES },
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  let body: { id?: string; action?: string; artist?: string; title?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    res.status(400).json({ code: 400, message: "Invalid JSON body." });
    return;
  }

  const { id, action, artist, title } = body;
  if (typeof id !== "string" || !id || (action !== "approve" && action !== "reject")) {
    res.status(400).json({ code: 400, message: "id and a valid action are required." });
    return;
  }

  if (action === "approve") {
    const parsed = parseIdentityOverride(artist, title);
    if (!parsed.ok) {
      res.status(400).json({ code: 400, message: "Invalid artist/title override." });
      return;
    }
    const outcome = await approveProposal(id, parsed.identity);
    if (!outcome) {
      res.status(404).json({ code: 404, message: "Proposal not found." });
      return;
    }
    res.status(200).json(outcome);
    return;
  }

  const outcome = await rejectProposal(id);
  if (!outcome) {
    res.status(404).json({ code: 404, message: "Proposal not found." });
    return;
  }
  res.status(200).json(outcome);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ code: 405, message: "Method not allowed." });
    return;
  }

  if (!isAuthorizedAdmin(req)) {
    res.status(401).json({ code: 401, message: "Unauthorized." });
    return;
  }

  try {
    if (req.method === "GET") await handleGet(req, res);
    else await handlePost(req, res);
  } catch (e) {
    console.error("Proposal review error:", e);
    res.status(500).json({ code: 500, message: "Internal server error." });
  }
}
