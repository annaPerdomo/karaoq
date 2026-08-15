// Kept pure and dependency-free: it runs in the browser bundle and on the server.

// YouTube video ids are exactly 11 URL-safe base64 characters.
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type SearchInput =
  | { kind: "video"; id: string; from: "url" | "bare" }
  | { kind: "youtube-url" } // a YouTube link with no extractable single video
  | { kind: "url" } // any other http(s) URL
  | { kind: "text" }; // an ordinary search query

const YOUTUBE_HOST_RE = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)$/i;
// Only YouTube-shaped strings get the https:// rescue below for a pasted
// "youtu.be/xyz" — "example.com/foo" stays text, it could be a song title.
const SCHEMELESS_YOUTUBE_RE = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

const ID_IN_PATH = new Set(["shorts", "embed", "live"]);

function asVideoId(value: string | null | undefined): string | null {
  return typeof value === "string" && VIDEO_ID_RE.test(value) ? value : null;
}

/** http(s) only — a "mailto:" or "javascript:" string is not a link we follow. */
function parseUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (url.protocol === "http:" || url.protocol === "https:") return url;
    return null;
  } catch {}
  if (SCHEMELESS_YOUTUBE_RE.test(input)) {
    try {
      return new URL(`https://${input}`);
    } catch {}
  }
  return null;
}

function extractVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  // youtu.be/<id> — the whole path is the id.
  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    return asVideoId(segments[0]);
  }
  const route = segments[0]?.toLowerCase();
  // A watch URL carrying ?list= still resolves to its single video — that is
  // what someone sharing a playlist-context link means.
  if (route === "watch") return asVideoId(url.searchParams.get("v"));
  if (route && ID_IN_PATH.has(route)) return asVideoId(segments[1]);
  return null;
}

export function classifySearchInput(input: string): SearchInput {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "text" };

  // Tagged apart from a URL-derived id because an 11-character word can be a
  // genuine query: the search hook falls back to text search on a bare miss.
  if (VIDEO_ID_RE.test(trimmed)) {
    return { kind: "video", id: trimmed, from: "bare" };
  }

  const url = parseUrl(trimmed);
  if (!url) return { kind: "text" };
  if (!YOUTUBE_HOST_RE.test(url.hostname)) return { kind: "url" };

  const id = extractVideoId(url);
  return id ? { kind: "video", id, from: "url" } : { kind: "youtube-url" };
}
