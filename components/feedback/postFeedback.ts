import { getActiveLocale, LOCALE_HEADER } from "../../lib/i18n/activeLocale";
import type { FeedbackKind } from "../../pages/api/types";

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  contact: string;
  roomId?: string;
  role?: "host" | "singer";
}

export default async function postFeedback(
  draft: FeedbackDraft
): Promise<boolean> {
  try {
    const resp = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LOCALE_HEADER]: getActiveLocale().locale,
      },
      body: JSON.stringify({
        ...draft,
        // Search/hash can carry a room code or a name; only the route matters here.
        page:
          typeof window === "undefined" ? undefined : window.location.pathname,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
