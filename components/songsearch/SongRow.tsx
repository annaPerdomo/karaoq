import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import {
  SongSuggestion,
  displaySongArtist,
  displaySongTitle,
} from '../../app/queue/songSuggestions';
import type { CutPreview } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';

interface SongRowProps {
  song: SongSuggestion;
  /** Position shown at the left: chart rank on a hot shelf, else list order. */
  number: number;
  /** The cut a tap opens; without one the row shows a placeholder and a tap
   *  falls back to the cuts search. */
  preview?: CutPreview;
  isNew?: boolean;
  climb?: number;
  rooms?: number;
  onSelect: () => void;
}

/** NEW beats a climb, and a fall shows nothing — a list of what's rising, not
 *  a scoreboard of who slipped. */
function Badge({ isNew, climb, rooms }: Pick<SongRowProps, 'isNew' | 'climb' | 'rooms'>) {
  const { t, tn } = useT();
  if (isNew) return <span className={styles.badgeNew}>{t('ideas.badge.new')}</span>;
  if (climb && climb > 0) return <span className={styles.badgeClimb}>▲{climb}</span>;
  if (rooms !== undefined) {
    return <span className={styles.badgeRooms}>{tn('ideas.rooms.count', rooms)}</span>;
  }
  return null;
}

const SongRow: React.FC<SongRowProps> = ({
  song,
  number,
  preview,
  isNew,
  climb,
  rooms,
  onSelect,
}) => {
  const title = displaySongTitle(song);
  const artist = displaySongArtist(song);

  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.num}>{number}</span>
      <span className={styles.thumbWrap}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit
          <img src={preview.thumbnailUrl} alt="" className={styles.thumb} loading="lazy" />
        ) : (
          <span className={styles.thumbEmpty} aria-hidden="true">♪</span>
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.artist}>{artist}</span>
      </span>
      <Badge isNew={isNew} climb={climb} rooms={rooms} />
    </button>
  );
};

export default SongRow;
