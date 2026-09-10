import type { DossierSongRow, RoomErrorRow, RoomSearchFailRow, RoomSearchRow } from '../types';

export type TimelineKind = 'song' | 'search' | 'problem';

export type TimelineEntry =
  | { kind: 'song'; at: number; song: DossierSongRow }
  | { kind: 'search'; at: number; search: RoomSearchRow }
  | { kind: 'error'; at: number; error: RoomErrorRow }
  | { kind: 'searchFail'; at: number; fail: RoomSearchFailRow };

export function mergeTimeline(input: {
  songs: DossierSongRow[];
  searchRuns: RoomSearchRow[];
  errors: RoomErrorRow[];
  searchFails: RoomSearchFailRow[];
}): TimelineEntry[] {
  return [
    ...input.songs.map((song): TimelineEntry => ({
      kind: 'song',
      at: new Date(song.timestamp).getTime(),
      song,
    })),
    ...input.searchRuns.map((search): TimelineEntry => ({
      kind: 'search',
      at: new Date(search.timestamp).getTime(),
      search,
    })),
    ...input.errors.map((error): TimelineEntry => ({
      kind: 'error',
      at: new Date(error.timestamp).getTime(),
      error,
    })),
    ...input.searchFails.map((fail): TimelineEntry => ({
      kind: 'searchFail',
      at: new Date(fail.timestamp).getTime(),
      fail,
    })),
  ].sort((a, b) => a.at - b.at);
}

export function entryKind(entry: TimelineEntry): TimelineKind {
  if (entry.kind === 'song') return 'song';
  if (entry.kind === 'search') return 'search';
  return 'problem';
}

const CACHE_LABELS: Record<RoomSearchRow['cache'], string> = {
  fresh: 'cache hit',
  coalesced: 'cache hit',
  miss: 'live search',
  stale: 'stale cache',
  corpus: 'corpus',
};

export function searchRunLabel(row: RoomSearchRow): { cache: string; live: boolean; meta: string } {
  const live = row.cache === 'miss';
  const corpus =
    live && row.songKnown !== null ? (row.songKnown ? 'in corpus' : 'banked') : null;
  const meta = [row.resultCount != null ? `${row.resultCount} results` : null, corpus]
    .filter(Boolean)
    .join(' · ');
  return { cache: CACHE_LABELS[row.cache], live, meta };
}

export function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
