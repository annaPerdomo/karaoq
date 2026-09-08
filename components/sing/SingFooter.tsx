import * as React from 'react';
import Link from 'next/link';

import styles from '../../styles/Sing.module.css';
import FeedbackTrigger from '../feedback/FeedbackTrigger';
import { useT } from '../../lib/i18n/I18nProvider';
import { renderWithHeart } from '../../lib/i18n/renderWithHeart';

// Ends the scrolling search column, not the page: on phones the fixed queue
// drawer owns the bottom edge and would cover a page-level footer.
export default function SingFooter({ roomId }: { roomId: string }) {
  const { t } = useT();

  return (
    <footer className={styles.inlineFooter}>
      <div className={styles.inlineFooterLegal}>
        <Link href="/privacy" className={styles.inlineFooterLink}>
          {t('footer.privacy')}
        </Link>
        <span className={styles.inlineFooterLegalSep} aria-hidden="true">·</span>
        <Link href="/terms" className={styles.inlineFooterLink}>
          {t('footer.terms')}
        </Link>
      </div>
      <a
        href="https://variationsonastring.com"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.inlineFooterLink}
      >
        {renderWithHeart(t('footer.credit'), styles.inlineFooterHeart)}
      </a>
      <FeedbackTrigger
        className={styles.inlineFooterFeedback}
        roomId={roomId}
        role="singer"
      />
    </footer>
  );
}
