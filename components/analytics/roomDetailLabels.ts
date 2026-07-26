import type { DisplayConfig, HostConfig } from '../../pages/api/types';
import { LOCALE_LABELS, isLocale } from '../../lib/i18n/config';
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
  search: 'Search',
  board_claim: 'Request',
  singwithme: 'Sing With Me',
};

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

function localeName(code: string): string {
  return isLocale(code) ? LOCALE_LABELS[code] : code;
}

export function languageLabel(p: Person): string {
  if (!p.locale) return '';
  return CHOSEN_LOCALE_SOURCES.includes(p.localeSource as LocaleSource)
    ? `${localeName(p.locale)} (picked)`
    : localeName(p.locale);
}

export function roomLanguageLabel(l: RoomLanguages | undefined): string {
  if (!l || (l.created === null && l.byLocale.length === 0)) {
    return 'Language: unknown';
  }
  const others = l.byLocale.filter((row) => row.locale !== l.created);
  const head = l.created ? localeName(l.created) : 'Language not recorded';
  if (others.length === 0) return head;
  const rest = others
    .map((row) => `${row.people} in ${localeName(row.locale)}`)
    .join(', ');
  return `${head} · ${rest}`;
}

export function roomLanguageTitle(l: RoomLanguages | undefined): string {
  if (!l || l.byLocale.length === 0) {
    return 'No language was recorded for this room.';
  }
  return l.byLocale
    .map(
      (row) =>
        `${localeName(row.locale)}: ${row.people} ${
          row.people === 1 ? 'person' : 'people'
        }, ${row.chosen} picked it deliberately`
    )
    .join('\n');
}
