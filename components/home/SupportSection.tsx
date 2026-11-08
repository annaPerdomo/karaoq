import Link from 'next/link';
import * as React from 'react';
import styles from '../../styles/Home.module.css';
import supportStyles from '../../styles/Support.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import Reveal from './Reveal';
import TipButton from '../support/TipButton';

export default function SupportSection() {
  const { t } = useT();
  return (
    <section id="support" className={supportStyles.homeSection}>
      <Reveal>
        <p className={supportStyles.homeEyebrow}>{t('support.eyebrow')}</p>
        <h2 className={styles.sectionTitle}>{t('support.title')}</h2>
        <p className={supportStyles.homeSub}>{t('support.homeSub')}</p>
        <div className={supportStyles.homeActions}>
          <TipButton />
          <Link href="/support" className={supportStyles.homeStoryLink}>
            {t('support.readStory')} &rarr;
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
