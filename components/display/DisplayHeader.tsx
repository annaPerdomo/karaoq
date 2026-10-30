import * as React from 'react';
import styles from '../../styles/Display.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import LanguageSwitcher from '../LanguageSwitcher';
import ClubLogo from '../brand/ClubLogo';
import { Icons } from '../host/icons';

export default function DisplayHeader({
  joinCode,
  logo,
  sidebarCollapsed,
  showCustomize,
  onCustomize,
}: {
  joinCode: string;
  logo: string | undefined;
  sidebarCollapsed: boolean;
  showCustomize: boolean;
  onCustomize: () => void;
}) {
  const { t } = useT();
  return (
    <header className={`${styles.header} ${sidebarCollapsed ? styles.headerNoSidebar : ''}`}>
      <ClubLogo
        roomId={joinCode}
        logo={logo}
        className={styles.clubLogo}
        dividerClassName={styles.clubDivider}
      />
      <div className={styles.brand}>KaraoQ</div>
      <div className={styles.headerActions}>
        {showCustomize && (
          <button
            className={styles.headerEdit}
            onClick={onCustomize}
            title={t('customize.button')}
            data-remote="customize"
          >
            {Icons.brush}
            <span>{t('customize.button')}</span>
          </button>
        )}
        <LanguageSwitcher className={styles.headerLang} />
      </div>
    </header>
  );
}
