// Pointer to the room this device most recently hosted, so the landing page
// can offer "resume your room" instead of letting a returning host create a
// duplicate. Refreshed every time the host view loads, so an active night
// keeps its window alive.

const STORAGE_KEY = "karaoq_last_hosted_room";

// A karaoke night spans an evening; past this the room is someone's old
// session, not "tonight", and offering it would just confuse.
const LAST_ROOM_TTL_MS = 12 * 60 * 60 * 1000;

export interface LastHostedRoom {
  code: string;
  ts: number;
}

export function rememberLastHostedRoom(code: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ code, ts: Date.now() } satisfies LastHostedRoom),
    );
  } catch {}
}

export function getLastHostedRoom(): LastHostedRoom | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastHostedRoom;
    if (!parsed?.code || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > LAST_ROOM_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastHostedRoom(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
