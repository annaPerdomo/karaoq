import * as React from 'react';

import styles from '../../styles/PlacePicker.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { displayName } from './ShelfSection';

interface PlacePickerProps {
  /** Country codes on offer; "" stands for the singer's own unknown place. */
  places: string[];
  value: string;
  home: string | null;
  onChange: (place: string) => void;
  /** The "Song ideas" title the chip sits beside, and the line under it. */
  title: React.ReactNode;
  sub: React.ReactNode;
}

function flag(cc: string): string {
  try {
    return String.fromCodePoint(...cc.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  } catch {
    return '';
  }
}

/** The "Song ideas" heading with its place chip, and the flag grid the chip
 *  opens in place — not a modal: picking one closes it and every tab follows. */
const PlacePicker: React.FC<PlacePickerProps> = ({ places, value, home, onChange, title, sub }) => {
  const { t, locale } = useT();
  const [open, setOpen] = React.useState(false);
  const homeValue = home ?? '';
  const label = (cc: string) => (cc ? displayName(cc, 'region', locale) : t('ideas.place.nearYou'));
  // The singer's own place first, then everywhere else alphabetically.
  const others = places
    .filter((cc) => cc !== homeValue)
    .sort((a, b) => label(a).localeCompare(label(b), locale));

  const option = (cc: string) => (
    <button
      key={cc || 'here'}
      type="button"
      className={`${styles.option} ${cc === value ? styles.optionActive : ''}`}
      aria-pressed={cc === value}
      onClick={() => {
        onChange(cc);
        setOpen(false);
      }}
    >
      <span className={styles.flag} aria-hidden="true">
        {cc ? flag(cc) : '📍'}
      </span>
      <span className={styles.name}>{label(cc)}</span>
      {cc === homeValue && <span className={styles.here}>{t('ideas.place.here')}</span>}
    </button>
  );

  return (
    <div className={styles.heading}>
      <div className={styles.titleRow}>
        {title}
        <button
        type="button"
        className={`${styles.chip} ${open ? styles.chipOpen : ''}`}
        aria-expanded={open}
        aria-label={t('ideas.place.choose')}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.flag} aria-hidden="true">
          {value ? flag(value) : '📍'}
        </span>
        <span className={styles.chipName}>{label(value)}</span>
        <span className={styles.caret} aria-hidden="true">▾</span>
        </button>
      </div>
      {sub}
      {open && (
        <div className={styles.panel}>
          {option(homeValue)}
          {others.map(option)}
        </div>
      )}
    </div>
  );
};

export default PlacePicker;
