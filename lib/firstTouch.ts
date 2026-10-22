export interface FirstTouch {
  ref?: string;
  referrer?: string;
  entry: string;
  at: number;
}

export const FIRST_TOUCH_KEY = "karaoq_first_touch";
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_REF_LENGTH = 40;
const MAX_REFERRER_HOST_LENGTH = 80;
const MAX_ENTRY_LENGTH = 80;

export function sanitizeRef(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, MAX_REF_LENGTH);
  return cleaned || undefined;
}

export function sanitizeReferrerHost(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  host = host.replace(/^www\./, "");
  if (!host) return undefined;
  if (host === "localhost" || host === "karaoq.live" || host.endsWith(".karaoq.live")) {
    return undefined;
  }
  const cleaned = host.replace(/[^a-z0-9.-]/g, "").slice(0, MAX_REFERRER_HOST_LENGTH);
  return cleaned || undefined;
}

export function sanitizeEntry(raw: string | null | undefined): string | undefined {
  if (!raw || !raw.startsWith("/")) return undefined;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9/_-]/g, "").slice(0, MAX_ENTRY_LENGTH);
  return cleaned.startsWith("/") ? cleaned : undefined;
}

function readStored(now: number): FirstTouch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirstTouch;
    if (!parsed || typeof parsed.at !== "number" || typeof parsed.entry !== "string") return null;
    if (now - parsed.at > FIRST_TOUCH_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(value: FirstTouch): void {
  try {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(value));
  } catch {}
}

export function captureFirstTouch(href: string, referrer: string, now: number): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(href);
    const ref = sanitizeRef(url.searchParams.get("ref")) ?? sanitizeRef(url.searchParams.get("utm_source"));
    const existing = readStored(now);

    if (existing) {
      if (ref) writeStored({ ...existing, ref, at: now });
      return;
    }

    writeStored({
      ...(ref ? { ref } : {}),
      referrer: sanitizeReferrerHost(referrer),
      entry: sanitizeEntry(url.pathname) ?? "/",
      at: now,
    });
  } catch {}
}

export function getFirstTouch(now: number = Date.now()): FirstTouch | null {
  return readStored(now);
}

export function firstTouchHeaders(now: number = Date.now()): Record<string, string> {
  let stored = getFirstTouch(now);
  // A room-create fetch can fire from a child component's effect before _app's
  // own effect has captured anything, so capture here too if nothing landed yet.
  if (!stored && typeof window !== "undefined") {
    captureFirstTouch(window.location.href, document.referrer, now);
    stored = getFirstTouch(now);
  }
  if (!stored) return {};
  const headers: Record<string, string> = {};
  if (stored.ref) headers["x-karaoq-ref"] = stored.ref;
  if (stored.referrer) headers["x-karaoq-referrer"] = stored.referrer;
  if (stored.entry) headers["x-karaoq-entry"] = stored.entry;
  return headers;
}
