import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import Reveal from './Reveal';

// Setup Guide — answers the question How It Works leaves open: "OK, but what do I
// physically need?" Three honest recipes — every one is just a
// browser plus whatever plays the audio.
export default function SetupSection() {
  const { t } = useT();
  return (
    <section id="setup" className={styles.setupSection}>
      <Reveal>
        <h2 className={styles.sectionTitle}>{t('home.setup.title')}</h2>
        <p className={styles.sectionSub}>
          {t('home.setup.sub')}
        </p>
      </Reveal>

      <div className={styles.setupGrid}>
        <Reveal delay={0}>
          <div className={styles.setupCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
            <span className={styles.setupTag}>{t('home.setup.card1.tag')}</span>
            <h3 className={styles.setupTitle}>{t('home.setup.card1.title')}</h3>
            <p className={styles.setupDesc}>
              {t('home.setup.card1.desc')}
            </p>
            <div className={styles.setupGearBox}>
              <span className={styles.setupGearLabel}>{t('home.setup.youNeed')}</span>
              <ul className={styles.setupGear}>
                <li>{t('home.setup.card1.gear1')}</li>
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className={styles.setupCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
            <span className={styles.setupTag}>{t('home.setup.card2.tag')}</span>
            <h3 className={styles.setupTitle}>{t('home.setup.card2.title')}</h3>
            <p className={styles.setupDesc}>
              {t('home.setup.card2.desc')}
            </p>
            <div className={styles.setupGearBox}>
              <span className={styles.setupGearLabel}>{t('home.setup.youNeed')}</span>
              <ul className={styles.setupGear}>
                <li>{t('home.setup.card2.gear1')}</li>
                <li>{t('home.setup.card2.gear2')}</li>
                <li>{t('home.setup.card2.gear3')}</li>
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className={styles.setupCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
            <span className={styles.setupTag}>{t('home.setup.card3.tag')}</span>
            <h3 className={styles.setupTitle}>{t('home.setup.card3.title')}</h3>
            <p className={styles.setupDesc}>
              {t('home.setup.card3.desc')}
            </p>
            <div className={styles.setupGearBox}>
              <span className={styles.setupGearLabel}>{t('home.setup.youNeed')}</span>
              <ul className={styles.setupGear}>
                <li>{t('home.setup.card3.gear1')}</li>
                <li>{t('home.setup.card3.gear2')}</li>
                <li>{t('home.setup.card3.gear3')}</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <p className={styles.setupNote}>
          <strong>{t('home.setup.note.strong')}</strong>
          {t('home.setup.note.rest')}
        </p>
      </Reveal>
    </section>
  );
}
