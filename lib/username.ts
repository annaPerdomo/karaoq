// Durable display-name storage.
//
// localStorage is the natural home for a singer's name, but it's unavailable or
// ephemeral in exactly the browsers karaoke singers use: Safari Private
// Browsing, iOS's ~7-day ITP eviction of script-written storage, and in-app
// webviews (opening the join link from iMessage / WhatsApp / Instagram), which
// often hand back partitioned or empty storage on the next load. A cookie
// survives several of those contexts localStorage drops, so we mirror the name
// to both and read whichever still has it.
//
// Every access is guarded. A bare localStorage call previously threw in blocked-
// storage contexts and aborted the join screen's whole mount effect, which left
// the "what's your name" overlay showing on every visit.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readCookie(name: string): string | null {
  try {
    const prefix = `${name}=`;
    const hit = document.cookie.split('; ').find((c) => c.startsWith(prefix));
    return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* storage blocked — nothing more we can do */
  }
}

/** Read a persisted name, preferring localStorage and falling back to the cookie. */
export function getStoredName(key: string): string {
  try {
    const local = localStorage.getItem(key);
    if (local) return local;
  } catch {
    /* fall through to the cookie */
  }
  return readCookie(key) ?? '';
}

/** Persist a name to both localStorage and a cookie. No-ops on an empty name. */
export function setStoredName(key: string, value: string): void {
  const name = value.trim();
  if (!name) return;
  try {
    localStorage.setItem(key, name);
  } catch {
    /* private mode — the cookie fallback below still runs */
  }
  writeCookie(key, name);
}
