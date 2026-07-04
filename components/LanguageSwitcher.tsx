import * as React from 'react';

import styles from '../styles/LanguageSwitcher.module.css';
import { useT } from '../lib/i18n/I18nProvider';
import { SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS, Locale, isLocale } from '../lib/i18n/config';

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Compact globe pill for choosing the UI language. The visible trigger shows
 * the current language in its own name/script ("日本語", "Español") — what a
 * speaker recognizes at a glance, regardless of the surrounding UI language.
 * The full native-name list lives in a native <select> stretched invisibly over
 * it, so keyboard/screen-reader behavior and the mobile picker stay native.
 * Persists the choice via setLocale (localStorage) so it sticks across visits.
 */
const LanguageSwitcher = ({ className }: LanguageSwitcherProps): React.ReactElement => {
  const { locale, setLocale, t } = useT();

  return (
    <div className={`${styles.wrap} ${className ?? ''}`} title={LOCALE_LABELS[locale]}>
      <svg
        className={styles.globe}
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18z" />
      </svg>
      <span className={styles.code}>{LOCALE_SHORT_LABELS[locale]}</span>
      <svg
        className={styles.chevron}
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select
        className={styles.select}
        value={locale}
        onChange={(e) => {
          const next = e.target.value;
          if (isLocale(next)) setLocale(next as Locale);
        }}
        aria-label={t('lang.choose')}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
