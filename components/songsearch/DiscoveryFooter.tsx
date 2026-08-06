import * as React from 'react';
import Link from 'next/link';

import styles from '../../styles/SongSearch.module.css';
import FeedbackTrigger from '../feedback/FeedbackTrigger';
import { useT } from '../../lib/i18n/I18nProvider';
import { renderWithHeart } from '../../lib/i18n/renderWithHeart';

interface DiscoveryFooterProps {
  onSurpriseMe: () => void;
  roomId: string;
  role?: 'host' | 'singer';
}

const DiscoveryFooter: React.FC<DiscoveryFooterProps> = ({
  onSurpriseMe,
  roomId,
  role,
}) => {
  const { t } = useT();

  return (
    <>
      <div className={styles.randWrap}>
        <span className={styles.randLabel}>{t('search.help')}</span>
        <button className={styles.surpriseBtn} onClick={onSurpriseMe}>
          <span className={styles.surpriseIcon}>🎲</span>
          {t('search.surprise')}
        </button>
      </div>

      <div className={styles.inlineFooter}>
        <Link
          href="/privacy"
          className={`${styles.inlineFooterLink} ${styles.inlineFooterPrivacy}`}
        >
          {t('footer.privacy')}
        </Link>
        <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.inlineFooterLink}>
          {renderWithHeart(t('footer.credit'), styles.inlineFooterHeart)}
        </a>
        <FeedbackTrigger
          className={styles.inlineFooterFeedback}
          roomId={roomId}
          role={role}
        />
      </div>
    </>
  );
};

export default DiscoveryFooter;
