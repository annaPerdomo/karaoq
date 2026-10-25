import * as React from 'react';

import ssStyles from '../../styles/SongSearch.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { displayName } from './ShelfSection';

interface PlacePickerProps {
  /** Country codes on offer; "" stands for the singer's own unknown place. */
  places: string[];
  value: string;
  onChange: (place: string) => void;
}

function flag(cc: string): string {
  try {
    return String.fromCodePoint(...cc.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  } catch {
    return '';
  }
}

const PlacePicker: React.FC<PlacePickerProps> = ({ places, value, onChange }) => {
  const { t, locale } = useT();
  const options = places
    .map((cc) => ({
      cc,
      label: cc ? `${flag(cc)} ${displayName(cc, 'region', locale)}`.trim() : t('ideas.place.nearYou'),
    }))
    .sort((a, b) => (a.cc === '' ? -1 : b.cc === '' ? 1 : a.label.localeCompare(b.label, locale)));

  return (
    <div className={ssStyles.langPickerRow}>
      <span className={ssStyles.langPickerLabel}>{t('ideas.world.pick')}</span>
      <select className={ssStyles.langPicker} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.cc || 'here'} value={o.cc}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PlacePicker;
