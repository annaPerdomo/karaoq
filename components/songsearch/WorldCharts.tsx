import * as React from 'react';

import styles from '../../styles/IdeaRows.module.css';
import ssStyles from '../../styles/SongSearch.module.css';
import type { IdeaShelf, ShelfSong } from '../../lib/shelfTypes';
import { useT } from '../../lib/i18n/I18nProvider';
import { useWorldCharts } from './hooks/useWorldCharts';
import SongRow from './SongRow';
import { INITIAL_CATEGORY_SONGS } from './constants';

interface WorldChartsProps {
  /** The singer's own country, which the picker doesn't open on. */
  home: string | null;
  onSelect: (song: ShelfSong, shelf: IdeaShelf) => void;
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

const WorldCharts: React.FC<WorldChartsProps> = ({ home, onSelect }) => {
  const { t, locale } = useT();
  const { charts, country, chart, pick } = useWorldCharts(home);
  const [expanded, setExpanded] = React.useState(false);

  if (!chart || !country) return null;
  const options = charts
    .map((c) => ({ cc: c.country!, name: regionName(c.country!, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const visible = expanded ? chart.songs : chart.songs.slice(0, INITIAL_CATEGORY_SONGS);

  return (
    <section className={styles.shelf}>
      <div className={styles.shelfHead}>
        <h3 className={styles.shelfTitle}>
          <span aria-hidden="true">🌍</span> {t('ideas.world.title')}
        </h3>
        <span className={styles.shelfSub}>{t('ideas.world.sub')}</span>
      </div>
      <div className={ssStyles.langPickerRow}>
        <span className={ssStyles.langPickerLabel}>{t('ideas.world.pick')}</span>
        <select
          className={ssStyles.langPicker}
          value={country}
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
      <div className={ssStyles.songPanel}>
        {visible.map((song, i) => (
          <SongRow
            key={song.key}
            song={song}
            number={song.rank ?? i + 1}
            isNew={song.isNew}
            climb={song.climb}
            onSelect={() => onSelect(song, chart)}
          />
        ))}
        {!expanded && chart.songs.length > visible.length && (
          <button className={ssStyles.showMoreBtn} onClick={() => setExpanded(true)}>
            {t('search.showAll', { count: chart.songs.length })}
          </button>
        )}
      </div>
    </section>
  );
};

export default WorldCharts;
