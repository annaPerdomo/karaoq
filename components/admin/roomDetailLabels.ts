import type { DisplayConfig, HostConfig } from '../../pages/api/types';
import { LOCALE_LABELS, isLocale } from '../../lib/i18n/config';
import { YOUTUBE_DATA_MAX_AGE_MS } from '../../lib/youtubeRetention';
import {
  CHOSEN_LOCALE_SOURCES,
  type LocaleSource,
} from '../../lib/i18n/activeLocale';

export interface Person {
  userName: string | null;
  role: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  country: string | null;
  city: string | null;
  locale: string | null;
  localeSource: string | null;
  /** "tv" | "mobile" | "desktop"; null on sessions with no stored UA. */
  device: string | null;
  /** TV make ("LG", "Samsung", …); null on everything that isn't a TV. */
  tvPlatform: string | null;
  /** Display name for the device: "iPhone", "Windows", "LG TV". */
  platform: string | null;
}

export interface SongRow {
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  via: string;
  timestamp: string;
}

export interface RequestRow {
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  timestamp: string;
}

export interface SingWithMeRow {
  kind: 'posted' | 'joined' | 'queued';
  userName: string | null;
  songTitle: string | null;
  videoId: string | null;
  timestamp: string;
}

export interface FairToggle {
  enabled: boolean;
  timestamp: string;
}

export interface RoomLanguages {
  /** null where the room predates recording. */
  created: string | null;
  byLocale: { locale: string; people: number; chosen: number }[];
}

export interface RoomDetailData {
  roomId: string;
  people: Person[];
  songs: SongRow[];
  requests: RequestRow[];
  singWithMe: SingWithMeRow[];
  /** null where the room predates the flag and nothing was ever recorded. */
  fairRotation: {
    started: boolean | null;
    final: boolean | null;
    toggles: FairToggle[];
  };
  /** Absent entirely on a response from an older deploy. */
  layout?: {
    display: DisplayConfig | null;
    host: HostConfig | null;
    displaySaves: number;
    hostSaves: number;
  };
  languages?: RoomLanguages;
  counts: {
    people: number;
    songs: number;
    requests: number;
    singWithMe: number;
    reactions: number;
    searches: number;
  };
}

export const VIA_LABELS: Record<string, string> = {
  ideas: 'Ideas',
  search: 'Search',
  paste: 'Link',
  board_claim: 'Request',
  singwithme: 'Sing With Me',
};

export function pickTitle(s: {
  via: string;
  fromCorpus?: boolean | null;
}): string | undefined {
  if (s.via !== 'ideas') return undefined;
  if (s.fromCorpus === true) return 'Picked from the shelves — served by the corpus';
  if (s.fromCorpus === false)
    return 'Picked from the shelves — the corpus couldn’t answer, so it spent a live search';
  return 'Picked from the shelves (the corpus was never asked)';
}

export const SWM_LABELS: Record<string, string> = {
  posted: 'Posted',
  joined: 'Joined',
  queued: 'Queued',
};

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Songs lose their title at 30 days (lib/youtubeRetention), so an old room would
 * otherwise read as a pile of "Untitled" — a bug, rather than the retention rule
 * working. Dated off the event, not the room: a long-lived room holds both sides
 * of the cutoff.
 */
export function songTitleLabel(title: string | null, iso: string): string {
  if (title) return title;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && Date.now() - at > YOUTUBE_DATA_MAX_AGE_MS
    ? 'Song data expired (30-day YouTube limit)'
    : 'Untitled';
}

export function fairLabel(f: RoomDetailData['fairRotation']): string {
  if (f.final === null) return 'Fair rotation: unknown';
  const state = f.final ? 'on' : 'off';
  const n = f.toggles.length;
  return n === 0
    ? `Fair rotation ${state} (default)`
    : `Fair rotation ${state} · toggled ${n}${n === 1 ? ' time' : ' times'}`;
}

export function fairTitle(f: RoomDetailData['fairRotation']): string {
  if (f.final === null) {
    return 'This room was created before fair rotation was recorded.';
  }
  const lines = [`Started ${f.started ? 'on' : 'off'}`];
  for (const t of f.toggles) {
    lines.push(`${formatTime(t.timestamp)} — turned ${t.enabled ? 'on' : 'off'}`);
  }
  return lines.join('\n');
}

export function locationLabel(p: Person): string {
  if (p.city) return `${safeDecode(p.city)}, ${p.country ?? ''}`.replace(/, $/, '');
  return p.country || '';
}

export function localeName(code: string): string {
  return isLocale(code) ? LOCALE_LABELS[code] : code;
}

/** One row of "who ran the room in what". The rooms list omits `chosen`. */
export interface LocaleCount {
  locale: string;
  people: number;
}

function byPeopleDesc<T extends LocaleCount>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.people - a.people || a.locale.localeCompare(b.locale));
}

/** "English 3 · Português 1" — the languages people actually ran in, biggest group first. */
export function languageMixLabel(rows: LocaleCount[]): string {
  return byPeopleDesc(rows)
    .map((r) => `${localeName(r.locale)} ${r.people}`)
    .join(' · ');
}

/** Table-cell form: the dominant language's code plus how many others, e.g. "EN +1". */
export function languageMixShort(rows: LocaleCount[]): string {
  const sorted = byPeopleDesc(rows);
  if (sorted.length === 0) return '—';
  const head = sorted[0].locale.toUpperCase();
  return sorted.length === 1 ? head : `${head} +${sorted.length - 1}`;
}

/**
 * Tooltip for a room's language, for both the rooms table and the detail footer. Leads with the
 * observed mix and treats the room's creation language as the secondary fact, because that one is
 * absent on most rooms — see the note on `locale` in pages/api/analytics/rooms.ts.
 */
export function languageMixTitle(
  rows: LocaleCount[],
  created: string | null
): string {
  const lines = byPeopleDesc(rows).map(
    (r) => `${localeName(r.locale)}: ${r.people} ${r.people === 1 ? 'person' : 'people'}`
  );
  if (lines.length === 0) lines.push('No participant language was recorded.');
  lines.push(
    created
      ? `Room created in ${localeName(created)}.`
      : 'The language the room was created in was not recorded.'
  );
  return lines.join('\n');
}

export function languageLabel(p: Person): string {
  if (!p.locale) return '';
  return CHOSEN_LOCALE_SOURCES.includes(p.localeSource as LocaleSource)
    ? `${localeName(p.locale)} (picked)`
    : localeName(p.locale);
}

/** TVs keep the marker as well as the make, since "LG" alone doesn't explain a
 *  slow room. Blank only when the session stored no User-Agent. */
export function deviceLabel(p: Person): string {
  if (p.device === 'tv') return `📺 ${p.platform ?? 'Smart TV'}`;
  return p.platform ?? '';
}

/**
 * Leads with the languages people actually ran the room in, which is the fact we almost always
 * have. The creation language moves to the tooltip: heading with it read as a contradiction
 * ("Language not recorded · 3 in English") on the many rooms where only it is missing.
 */
export function roomLanguageLabel(l: RoomLanguages | undefined): string {
  if (!l || (l.created === null && l.byLocale.length === 0)) {
    return 'Language not recorded';
  }
  if (l.byLocale.length === 0) return `Created in ${localeName(l.created!)}`;
  return languageMixLabel(l.byLocale);
}

export function roomLanguageTitle(l: RoomLanguages | undefined): string {
  if (!l) return 'No language was recorded for this room.';
  const lines = byPeopleDesc(l.byLocale).map(
    (row) =>
      `${localeName(row.locale)}: ${row.people} ${
        row.people === 1 ? 'person' : 'people'
      }, ${row.chosen} picked it deliberately`
  );
  if (lines.length === 0) lines.push('No participant language was recorded.');
  lines.push(
    l.created
      ? `Room created in ${localeName(l.created)}.`
      : 'The language the room was created in was not recorded.'
  );
  return lines.join('\n');
}
