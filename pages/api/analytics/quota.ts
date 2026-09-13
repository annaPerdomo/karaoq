import { NextApiRequest, NextApiResponse } from "next";
import { isAuthorizedAdmin } from "../../../lib/adminAuth";
import { SEARCH_DAY_QUOTA, ledgerDay, spentRecent } from "../../../lib/corpusBudget";
import type { DaySpendWire, QuotaLedgerData } from "../../../components/admin/types";

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

  try {
    const now = Date.now();
    const days: DaySpendWire[] = (await spentRecent(now, 7)).map((day) => ({
      ...day,
      mopUp: day.mopUp ? { ...day.mopUp, at: day.mopUp.at.toISOString() } : undefined,
    }));
    const data: QuotaLedgerData = {
      quota: SEARCH_DAY_QUOTA,
      today: ledgerDay(now),
      days,
    };
    res.status(200).json(data);
  } catch (e) {
    console.error("Quota ledger read failed:", e);
    res.status(500).json({ code: 500, message: "Failed to read the quota ledger." });
  }
}
