import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import Reveal from './Reveal';
import EqBars from './EqBars';

export default function UseCasesSection() {
  const { t } = useT();
  return (
    <section className={styles.useCasesSection}>
      <Reveal>
        <h2 className={styles.sectionTitle}>{t('home.useCases.title')}</h2>
      </Reveal>

      <div className={styles.useCasesGrid}>
        <Reveal delay={0}>
          <div className={styles.useCaseCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
            <EqBars color="#ec4899" />
            <h3 className={styles.useCaseTitle}>{t('home.useCase1.title')}</h3>
            <p className={styles.useCaseDesc}>
              {t('home.useCase1.desc')}
            </p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className={styles.useCaseCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
            <EqBars color="#06b6d4" />
            <h3 className={styles.useCaseTitle}>{t('home.useCase2.title')}</h3>
            <p className={styles.useCaseDesc}>
              {t('home.useCase2.desc')}
            </p>
          </div>
        </Reveal>
        <Reveal delay={200}>
          <div className={styles.useCaseCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
            <EqBars color="#f97316" />
            <h3 className={styles.useCaseTitle}>{t('home.useCase3.title')}</h3>
            <p className={styles.useCaseDesc}>
              {t('home.useCase3.desc')}
            </p>
          </div>
        </Reveal>
        <Reveal delay={300}>
          <div className={styles.useCaseCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
            <EqBars color="#a855f7" />
            <h3 className={styles.useCaseTitle}>{t('home.useCase4.title')}</h3>
            <p className={styles.useCaseDesc}>
              {t('home.useCase4.desc')}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
