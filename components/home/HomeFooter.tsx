import Link from 'next/link';
import * as React from 'react';
import { GUIDES } from '../../lib/guides';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { renderWithHeart } from '../../lib/i18n/renderWithHeart';
import FeedbackTrigger from '../feedback/FeedbackTrigger';

export default function HomeFooter() {
  const { t } = useT();
  return (
    <footer className={styles.footer}>
      <nav className={styles.footerGuides} aria-label={t('home.guides.title')}>
        <span className={styles.footerGuidesTitle}>{t('home.guides.title')}</span>
        <ul className={styles.footerGuidesList}>
          {GUIDES.map((g) => (
            <li key={g.id}>
              <Link href={`/guide/${g.slug}`} className={styles.footerGuidesLink}>
                {t(`guide.${g.id}.h1`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className={styles.footerInner}>
        <Link href="/privacy" className={`${styles.footerLink} ${styles.footerPrivacy}`}>
          {t('footer.privacy')}
        </Link>
        <a
          href="https://variationsonastring.com"
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.footerLink} ${styles.footerCredit}`}
        >
          {renderWithHeart(t('footer.credit'), styles.footerHeart)}
        </a>
        <FeedbackTrigger className={styles.footerFeedback} />
      </div>
    </footer>
  );
}
