import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import ssStyles from '../../styles/SongSearch.module.css';
import type { SongCategory, SongSection } from '../../app/queue/songSuggestions';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import { useWorldPlaces } from './hooks/useWorldPlaces';
import CategoryGrid from './CategoryGrid';
import SongRow from './SongRow';
import { INITIAL_CATEGORY_SONGS } from './constants';

interface WorldTabProps {
  /** The singer's own country, which the picker doesn't open on. */
  home: string | null;
  /** Every language list, to show beside its place's chart. */
  sections: SongSection[];
  onSongSelect: (song: ShelfSong, shelf: IdeaShelf) => void;
  onCategorySelect: (category: SongCategory, sectionId: string) => void;
}

function flag(cc: string): string {
  try {
    return String.fromCodePoint(...cc.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  } catch {
    return '';
  }
}

function regionName(cc: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

const WorldTab: React.FC<WorldTabProps> = ({ home, sections, onSongSelect, onCategorySelect }) => {
  const { t, locale } = useT();
  const { places, current, pick } = useWorldPlaces(home, sections);
  const [expanded, setExpanded] = React.useState(false);

  if (!current) return null;
  const options = places
    .map((p) => ({ cc: p.country, name: regionName(p.country, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const { chart, section } = current;
  const songs = chart?.songs ?? [];
  const visible = expanded ? songs : songs.slice(0, INITIAL_CATEGORY_SONGS);

  return (
    <div className={styles.shelves}>
      <div>
        <div className={ssStyles.langPickerRow}>
          <span className={ssStyles.langPickerLabel}>{t('ideas.world.pick')}</span>
          <select
            className={ssStyles.langPicker}
            value={current.country}
            onChange={(e) => {
              pick(e.target.value);
              setExpanded(false);
            }}
          >
            {options.map((o) => (
              <option key={o.cc} value={o.cc}>
                {`${flag(o.cc)} ${o.name}`.trim()}
              </option>
            ))}
          </select>
        </div>
        <span className={styles.shelfSub}>{t('ideas.world.sub')}</span>
      </div>

      {chart && (
        <section className={styles.shelf}>
          <div className={styles.shelfHead}>
            <h3 className={styles.shelfTitle}>
              <span aria-hidden="true">🔥</span>{' '}
              {t('ideas.hot.title', { country: regionName(current.country, locale) })}
            </h3>
            <span className={styles.shelfSub}>{t('ideas.hot.sub')}</span>
          </div>
          <div className={ssStyles.songPanel}>
            {visible.map((song, i) => (
              <SongRow
                key={song.key}
                song={song}
                number={song.rank ?? i + 1}
                isNew={song.isNew}
                climb={song.climb}
                onSelect={() => onSongSelect(song, chart)}
              />
            ))}
            {!expanded && songs.length > visible.length && (
              <button className={ssStyles.showMoreBtn} onClick={() => setExpanded(true)}>
                {t('search.showAll', { count: songs.length })}
              </button>
            )}
          </div>
        </section>
      )}

      {section && (
        <section className={styles.shelf}>
          <div className={styles.shelfHead}>
            <h3 className={styles.shelfTitle}>
              <span aria-hidden="true">💿</span> {t('ideas.world.classics')}
            </h3>
          </div>
          <CategoryGrid
            categories={section.categories}
            onSelect={(cat) => onCategorySelect(cat, section.id)}
          />
        </section>
      )}
    </div>
  );
};

export default WorldTab;
