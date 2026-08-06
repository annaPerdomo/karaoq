import * as React from 'react';

import styles from '../../styles/SongSearch.module.css';
import { SongSection } from '../../app/queue/songSuggestions';
import { useT } from '../../lib/i18n/I18nProvider';

interface LanguagePickerProps {
  langSections: SongSection[];
  currentLangId: string | undefined;
  onChange: (langId: string) => void;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  langSections,
  currentLangId,
  onChange,
}) => {
  const { t } = useT();

  return (
    <div className={styles.langPickerRow}>
      <span className={styles.langPickerLabel}>{t('search.tab.language')}</span>
      <select
        className={styles.langPicker}
        value={currentLangId ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {langSections.map((lang) => (
          <option key={lang.id} value={lang.id}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguagePicker;
