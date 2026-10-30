import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import {
  SongSuggestion,
  displaySongArtist,
  displaySongTitle,
} from '../../app/queue/songSuggestions';
import { useT } from '../../lib/i18n/I18nProvider';

interface SongRowProps {
  song: SongSuggestion;
  /** Position shown at the left: chart rank on a hot shelf, else list order. */
  number: number;
  isNew?: boolean;
  climb?: number;
  roomShare?: number;
  onSelect: () => void;
}

/** NEW beats a climb, and a fall shows nothing — a list of what's rising, not
 *  a scoreboard of who slipped. */
function Badge({ isNew, climb, roomShare }: Pick<SongRowProps, 'isNew' | 'climb' | 'roomShare'>) {
  const { t } = useT();
  if (isNew) return <span className={styles.badgeNew}>{t('ideas.badge.new')}</span>;
  if (climb && climb > 0) return <span className={styles.badgeClimb}>▲{climb}</span>;
  if (roomShare !== undefined) {
    return <span className={styles.badgeRooms}>{t('ideas.rooms.share', { percent: roomShare })}</span>;
  }
  return null;
}

const SongRow: React.FC<SongRowProps> = ({
  song,
  number,
  isNew,
  climb,
  roomShare,
  onSelect,
}) => {
  const title = displaySongTitle(song);
  const artist = displaySongArtist(song);

  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.num}>{number}</span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.artist}>{artist}</span>
      </span>
      <Badge isNew={isNew} climb={climb} roomShare={roomShare} />
    </button>
  );
};

export default SongRow;
