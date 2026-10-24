import * as React from 'react';

import styles from '../../styles/IdeaShelves.module.css';
import { displaySongArtist, displaySongTitle } from '../../app/queue/songSuggestions';
import type { ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';

interface ShelfCardProps {
  song: ShelfSong;
  onSelect: (song: ShelfSong) => void;
}

/** Movement beside the rank: NEW beats a climb, and a fall shows nothing — the
 *  shelf is for what's rising, not a scoreboard of who slipped. */
function Movement({ song }: { song: ShelfSong }) {
  const { t } = useT();
  if (song.isNew) return <span className={styles.badgeNew}>{t('ideas.badge.new')}</span>;
  if (song.climb && song.climb > 0) {
    return <span className={styles.badgeClimb}>▲{song.climb}</span>;
  }
  return null;
}

const ShelfCard: React.FC<ShelfCardProps> = ({ song, onSelect }) => {
  const { tn } = useT();
  const title = displaySongTitle(song);
  const artist = displaySongArtist(song);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onSelect(song)}
      aria-label={`${title} — ${artist}`}
    >
      <span className={styles.art}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit */}
        <img src={song.thumbnailUrl} alt="" className={styles.thumb} loading="lazy" />
        {song.rank !== undefined && <span className={styles.rank}>{song.rank}</span>}
        <span className={styles.badges}>
          <Movement song={song} />
        </span>
        <span className={styles.play} aria-hidden="true">
          ▶
        </span>
      </span>
      <span className={styles.title}>{title}</span>
      <span className={styles.artist}>{artist}</span>
      {song.rooms !== undefined && (
        <span className={styles.rooms}>🎤 {tn('ideas.rooms.count', song.rooms)}</span>
      )}
    </button>
  );
};

export default ShelfCard;
