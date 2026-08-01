import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { indices, type Guide } from '../../lib/guides';

interface GuideFaqProps {
  guide: Guide;
}

/**
 * FAQ section. Q&A copy comes from `guide.<id>.faqN.q/.a` and mirrors the
 * FAQPage JSON-LD emitted by the page head — keep the two sourced from the
 * same keys so the structured data always matches the visible answers.
 */
const GuideFaq = ({ guide }: GuideFaqProps): React.ReactElement | null => {
  const { t } = useT();
  if (guide.faqCount === 0) return null;

  const g = (suffix: string) => t(`guide.${guide.id}.${suffix}`);

  return (
    <section className={styles.faq}>
      <h2 className={styles.faqHeading}>{t('guide.faqHeading')}</h2>
      <dl className={styles.faqList}>
        {indices(guide.faqCount).map((n) => (
          <div key={n} className={styles.faqItem}>
            <dt className={styles.faqQ}>{g(`faq${n}.q`)}</dt>
            <dd className={styles.faqA}>{g(`faq${n}.a`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default GuideFaq;
