import Link from 'next/link';
import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import Reveal from './Reveal';
import { FAQ_ITEMS } from './faq';

export default function FaqSection() {
  const { t } = useT();
  return (
    <section className={styles.faqSection}>
      <Reveal>
        <h2 className={styles.sectionTitle}>{t('home.faq.title')}</h2>
        <p className={styles.sectionSub}>
          {t('home.faq.sub')}
        </p>
      </Reveal>

      <div className={styles.faqList}>
        {FAQ_ITEMS.map((item, i) => (
          <Reveal key={item.id} delay={i * 60}>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>{t(`faq.${item.id}.q`)}</summary>
              <p className={styles.faqAnswer}>{t(`faq.${item.id}.a`)}</p>
              {item.guideSlug && (
                <Link
                  href={`/guide/${item.guideSlug}`}
                  className={styles.faqGuideLink}
                >
                  {t('home.faq.readGuide')} &rarr;
                </Link>
              )}
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
