import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Sing.module.css';
import LanguageSwitcher from '../LanguageSwitcher';
import { useT } from '../../lib/i18n/I18nProvider';

const SingHeader = ({ joinCode }: { joinCode: string }): React.ReactElement => {
  const router = useRouter();
  const { t } = useT();
  return (
    <header className={styles.header}>
      <div className={styles.brand} onClick={() => router.push('/')}>
        KaraoQ
      </div>
      <div className={styles.headerRight}>
        <LanguageSwitcher />
        <div className={styles.roomBadge}>
          {t('common.room')}: <strong>{joinCode.toUpperCase()}</strong>
        </div>
      </div>
    </header>
  );
};

export default SingHeader;
