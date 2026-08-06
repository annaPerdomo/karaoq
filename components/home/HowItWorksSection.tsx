import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import Reveal from './Reveal';
import StartResumeDemo from './StartResumeDemo';
import QueueBuildDemo from './QueueBuildDemo';
import BigScreenDemo from './BigScreenDemo';

export default function HowItWorksSection() {
  const { t } = useT();
  return (
    <section id="how-it-works" className={styles.howSection}>
      <Reveal>
        <h2 className={styles.sectionTitle}>{t('home.how.title')}</h2>
        <p className={styles.sectionSub}>
          {t('home.how.sub')}
        </p>
      </Reveal>

      <div className={styles.steps}>
        <Reveal className={styles.step}>
          <div className={styles.stepDevice}>
            <span className={styles.stepTag}>{t('home.step1.tag')}</span>
            <div className={styles.laptopFrame}>
              <div className={styles.laptopScreen}>
                <span className={styles.laptopCamera} />
                <StartResumeDemo />
              </div>
              <div className={styles.laptopBase} />
            </div>
          </div>
          <div className={styles.stepText}>
            <span className={styles.stepNum}>1</span>
            <h3 className={styles.stepTitle}>{t('home.step1.title')}</h3>
            <p className={styles.stepDesc}>
              {t('home.step1.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal className={`${styles.step} ${styles.stepReverse}`}>
          <div className={styles.stepDevice}>
            <span className={styles.stepTag}>{t('home.step2.tag')}</span>
            <div className={styles.phoneFrameSm}>
              <div className={styles.phoneNotch} />
              <div className={styles.phoneScreen}>
                <QueueBuildDemo />
              </div>
            </div>
          </div>
          <div className={styles.stepText}>
            <span className={styles.stepNum}>2</span>
            <h3 className={styles.stepTitle}>{t('home.step2.title')}</h3>
            <p className={styles.stepDesc}>
              {t('home.step2.desc')}
            </p>
          </div>
        </Reveal>

        <Reveal className={styles.step}>
          <div className={styles.stepDevice}>
            <span className={styles.stepTag}>{t('home.step3.tag')}</span>
            <div className={styles.tvFrame}>
              <div className={styles.tvScreen}>
                <BigScreenDemo />
              </div>
              <div className={styles.tvStand} />
            </div>
          </div>
          <div className={styles.stepText}>
            <span className={styles.stepNum}>3</span>
            <h3 className={styles.stepTitle}>{t('home.step3.title')}</h3>
            <p className={styles.stepDesc}>
              {t('home.step3.desc')}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
