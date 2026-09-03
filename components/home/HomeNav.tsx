import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import LanguageSwitcher from '../LanguageSwitcher';

export interface HomeNavProps {
  brandHidden: boolean;
  creating: boolean;
  onJoin: () => void;
  onHost: () => void;
}

export default function HomeNav({ brandHidden, creating, onJoin, onHost }: HomeNavProps) {
  const { t } = useT();
  return (
    <nav className={styles.nav}>
      <span
        className={brandHidden ? `${styles.navLogo} ${styles.navLogoHidden}` : styles.navLogo}
        aria-hidden={brandHidden}
      >
        KaraoQ
      </span>
      <div className={styles.navLinks}>
        <a href="#how-it-works" className={styles.navLink}>{t('home.nav.how')}</a>
        <a href="#setup" className={styles.navLink}>{t('home.nav.setup')}</a>
        <a href="#features" className={styles.navLink}>{t('home.nav.features')}</a>
        <button className={styles.navCtaOutline} onClick={onJoin}>
          {t('home.nav.join')}
        </button>
        <button className={styles.navCta} onClick={onHost} disabled={creating}>
          {creating ? t('home.creating') : t('home.nav.host')}
        </button>
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
