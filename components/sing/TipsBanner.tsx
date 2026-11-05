import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

interface TipsBannerProps {
  username: string;
  onDismiss: () => void;
}

const TipsBanner = ({ username, onDismiss }: TipsBannerProps): React.ReactElement => {
  const { t } = useT();
  return (
    <div className={styles.tipsBanner}>
      <div className={styles.tipsBannerBody}>
        <span className={styles.tipsBannerTitle}>
          {username ? t('sing.tips.welcomeNamed', { name: username }) : t('sing.tips.welcome')}
        </span>
        <span className={styles.tipsBannerText}>
          {t('sing.tips.body')}
        </span>
      </div>
      <button
        className={styles.tipsBannerClose}
        onClick={onDismiss}
        aria-label={t('sing.tips.dismiss')}
      >
        ×
      </button>
    </div>
  );
};

export default TipsBanner;
