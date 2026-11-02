import * as React from "react";

export type OriginalVideoStatus = "loading" | "ok" | "none" | "quota" | "busy";

// "ineligible": the entry wasn't on stage or up next when asked (a 404 on a
// prefetch whose queue position moved). Refetched once it comes on stage.
interface CacheEntry {
  status: OriginalVideoStatus | "ineligible";
  videoIds: string[];
  candidateIndex: number;
  busyRetried: boolean;
}

// Transient — never retried in a tight loop. One retry per entry is plenty:
// a second music-video screen or a singer's search is the usual cause.
export const RETRY_BUSY_MS = 20_000;

function loadingEntry(): CacheEntry {
  return { status: "loading", videoIds: [], candidateIndex: 0, busyRetried: false };
}

/**
 * Resolves the original (non-karaoke) video for the entry on stage, with a
 * few fallback candidates. Answers are cached per entryId for the page's
 * life — the endpoint only ever answers for the active entry and the one
 * after it, so nothing here is worth re-fetching once settled.
 */
export function useOriginalVideo(
  joinCode: string | undefined,
  entryId: string | null,
  nextEntryId: string | null,
  override: string | null
): { videoId: string | null; status: OriginalVideoStatus; fail: () => void } {
  const cacheRef = React.useRef<Map<string, CacheEntry>>(new Map());
  const entryIdRef = React.useRef(entryId);
  entryIdRef.current = entryId;
  const failedOverrideRef = React.useRef<Map<string, string>>(new Map());
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const activeOverride =
    entryId && override && failedOverrideRef.current.get(entryId) !== override
      ? override
      : null;

  const fetchEntry = React.useCallback(
    (id: string) => {
      if (!joinCode) return;
      fetch(`/api/queue/${joinCode}/original-video?entryId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      })
        .then(async (resp) => {
          // A 404 is the server's definitive "not eligible" / "no corpus match" —
          // final for the entry on stage, like the "none" it returns on a 200.
          // Anything else that isn't ok (429, 5xx) is transient, same as the
          // server's own "busy".
          if (resp.status === 404) return { status: "ineligible" as const, videoIds: [] as string[] };
          if (!resp.ok) return { status: "busy" as const, videoIds: [] as string[] };
          return resp.json() as Promise<{ status: OriginalVideoStatus; videoIds: string[] }>;
        })
        // A network error is transient too — never final on its own.
        .catch(() => ({ status: "busy" as const, videoIds: [] as string[] }))
        .then((body) => {
          const prior = cacheRef.current.get(id);
          const alreadyRetried = prior?.busyRetried ?? false;
          // The one busy retry already ran and came back busy again — give up.
          let status: CacheEntry["status"] = body.status;
          if (status === "busy" && alreadyRetried) status = "none";
          if (status === "ineligible" && entryIdRef.current === id) status = "none";
          cacheRef.current.set(id, {
            status,
            videoIds: body.videoIds ?? [],
            candidateIndex: 0,
            busyRetried: alreadyRetried,
          });
          bump();
          if (body.status === "busy" && !alreadyRetried) {
            setTimeout(() => {
              const current = cacheRef.current.get(id);
              if (current?.status !== "busy") return;
              cacheRef.current.set(id, { ...current, busyRetried: true });
              fetchEntry(id);
            }, RETRY_BUSY_MS);
          }
        });
    },
    [joinCode]
  );

  React.useEffect(() => {
    if (!entryId || activeOverride) return;
    const cached = cacheRef.current.get(entryId);
    if (cached && cached.status !== "ineligible") return;
    cacheRef.current.set(entryId, loadingEntry());
    fetchEntry(entryId);
  }, [entryId, activeOverride, fetchEntry]);

  const current = entryId ? cacheRef.current.get(entryId) : undefined;
  const currentStatus = activeOverride ? "ok" : current?.status;

  // Prefetch the next entry once the current one is playable — never before,
  // so a quiet room doesn't spend a search on a song nobody is about to hear.
  React.useEffect(() => {
    if (!nextEntryId || currentStatus !== "ok" || cacheRef.current.has(nextEntryId)) return;
    cacheRef.current.set(nextEntryId, loadingEntry());
    fetchEntry(nextEntryId);
  }, [nextEntryId, currentStatus, fetchEntry]);

  const fail = React.useCallback(() => {
    if (!entryId) return;
    if (activeOverride) {
      failedOverrideRef.current.set(entryId, activeOverride);
      bump();
      return;
    }
    const entry = cacheRef.current.get(entryId);
    if (!entry) return;
    const nextIndex = entry.candidateIndex + 1;
    cacheRef.current.set(
      entryId,
      nextIndex < entry.videoIds.length
        ? { ...entry, candidateIndex: nextIndex }
        : { ...entry, status: "none" }
    );
    bump();
  }, [entryId, activeOverride]);

  if (activeOverride) return { videoId: activeOverride, status: "ok", fail };
  if (!current || current.status === "ineligible") return { videoId: null, status: "loading", fail };
  const videoId = current.status === "ok" ? current.videoIds[current.candidateIndex] ?? null : null;
  return {
    videoId,
    status: current.status === "ok" && videoId === null ? "none" : current.status,
    fail,
  };
}
