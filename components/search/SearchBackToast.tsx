import * as React from 'react';

import styles from '../../styles/SearchBackToast.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

interface SearchBackToastProps {
  show: boolean;
  onDismiss: () => void;
}

const SearchBackToast: React.FC<SearchBackToastProps> = ({ show, onDismiss }) => {
  const { t } = useT();
  if (!show) return null;
  return (
    <div className={styles.toast} role="status" onClick={onDismiss}>
      <span className={styles.icon} aria-hidden="true">
        🎤
      </span>
      <span>{t('search.backNotice')}</span>
    </div>
  );
};

export default SearchBackToast;
