import decodeHtml from './decodeHtml';

// Karaoke channels brand their uploads with their handle ("… (Karaoke With
// Lyrics) @StingrayKaraoke"), so it arrives baked into YouTube's own title and
// is stored with the entry. Any separator introducing the handle is taken with
// it, so no dangling "|" is left behind. Requiring a handle character straight
// after the "@" is what keeps "Live @ Wembley" from looking like one.
const CHANNEL_HANDLE = /\s*[-–—|·•:]?\s*@[A-Za-z0-9._-]{3,30}\s*$/;

export function stripChannel(title: string): string {
  let out = title;
  // A title can carry more than one handle ("… @KaraFun @KaraokeVersion").
  for (let i = 0; i < 3; i++) {
    const next = out.replace(CHANNEL_HANDLE, '');
    if (next === out) break;
    out = next;
  }
  const trimmed = out.trim();
  // A title that is *only* a handle is better shown as-is than as an empty row.
  return trimmed.length > 0 ? trimmed : title.trim();
}

/**
 * A stored song title, ready to render in a listing (queue, history, on-stage
 * banner, board card).
 *
 * Not for the surfaces where someone is *choosing* a version — search results,
 * the preview/confirm modals — there the channel is the signal they're reading.
 */
export default function formatSongTitle(raw: string): string {
  return stripChannel(decodeHtml(raw));
}
