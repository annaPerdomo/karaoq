import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import Reveal from './Reveal';

export default function FeaturesSection() {
  const { t } = useT();
  return (
    <section id="features" className={styles.featuresSection}>
      <Reveal>
        <h2 className={styles.sectionTitle}>{t('home.features.title')}</h2>
        <p className={styles.sectionSub}>
          {t('home.features.sub')}
        </p>
      </Reveal>

      <div className={styles.featuresGrid}>
        <Reveal delay={0}>
          <div className={styles.featureCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
            <div className={styles.featureIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <polygon points="10,8 14,11 10,14" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>{t('home.feature1.title')}</h3>
            <p className={styles.featureDesc}>
              {t('home.feature1.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className={styles.featureCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
            <div className={styles.featureIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2.5 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M21.5 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>{t('home.feature2.title')}</h3>
            <p className={styles.featureDesc}>
              {t('home.feature2.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className={styles.featureCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
            <div className={styles.featureIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>{t('home.feature3.title')}</h3>
            <p className={styles.featureDesc}>
              {t('home.feature3.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0}>
          <div className={styles.featureCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
            <div className={styles.featureIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="6" r="1.5" />
                <circle cx="16" cy="6" r="1.5" />
                <circle cx="8" cy="12" r="1.5" />
                <circle cx="16" cy="12" r="1.5" />
                <circle cx="8" cy="18" r="1.5" />
                <circle cx="16" cy="18" r="1.5" />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>{t('home.feature4.title')}</h3>
            <p className={styles.featureDesc}>
              {t('home.feature4.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className={styles.featureCard} style={{ '--accent': '#10b981' } as React.CSSProperties}>
            <div className={styles.featureIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
                <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>{t('home.feature5.title')}</h3>
            <p className={styles.featureDesc}>
              {t('home.feature5.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className={styles.featureCard} style={{ '--accent': '#3b82f6' } as React.CSSProperties}>
            <div className={styles.featureIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <h3 className={styles.featureTitle}>{t('home.feature6.title')}</h3>
            <p className={styles.featureDesc}>
              {t('home.feature6.desc')}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
