import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomSuggestionRow } from '../types';
import { SECTION_LABELS, SOURCE_LABELS } from '../format';
import { DossierRow, Section } from './DossierSections';

/** Our own catalog names, not YouTube's, so these survive the 30-day retention
 *  window the song timeline is subject to. */
export default function SuggestionsSection({
  suggestions,
  wide,
}: {
  suggestions: RoomSuggestionRow[];
  wide?: boolean;
}): React.ReactElement {
  const { songs, sources } = React.useMemo(
    () => summarize(suggestions),
    [suggestions]
  );

  return (
    <Section title="Song ideas used" count={suggestions.length} wide={wide}>
      <div className={styles.dossierStrip}>
        {sources.map(({ source, count }) => (
          <span key={source} className={styles.dossierChip}>
            {SOURCE_LABELS[source] ?? source} {count}
          </span>
        ))}
      </div>
      <div className={styles.dsRows}>
        {songs.length === 0 ? (
          <p className={styles.empty}>
            Ideas were browsed, but no song was picked from them
          </p>
        ) : (
          songs.map((song) => (
            <DossierRow
              key={song.key}
              title={song.artist ? `${song.title} — ${song.artist}` : song.title}
              badge={song.section}
              meta={[
                song.category,
                ...(song.count > 1 ? [`${song.count}×`] : []),
              ].filter(Boolean) as string[]}
            />
          ))
        )}
      </div>
    </Section>
  );
}

interface SongTally {
  key: string;
  title: string;
  artist: string | null;
  section: string;
  category: string;
  count: number;
}

function summarize(rows: RoomSuggestionRow[]): {
  songs: SongTally[];
  sources: { source: string; count: number }[];
} {
  const songs = new Map<string, SongTally>();
  const sources = new Map<string, number>();

  for (const row of rows) {
    sources.set(row.source, (sources.get(row.source) ?? 0) + 1);
    if (!row.songTitle) continue;
    const key = `${row.songTitle}|${row.songArtist ?? ''}`;
    const existing = songs.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    songs.set(key, {
      key,
      title: row.songTitle,
      artist: row.songArtist,
      section: row.sectionId
        ? SECTION_LABELS[row.sectionId] ?? row.sectionId
        : 'Surprise me',
      category: row.categoryId ?? '',
      count: 1,
    });
  }

  return {
    songs: Array.from(songs.values()).sort((a, b) => b.count - a.count),
    sources: Array.from(sources, ([source, count]) => ({ source, count })).sort(
      (a, b) => b.count - a.count
    ),
  };
}
