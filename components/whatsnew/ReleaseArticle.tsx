import Link from 'next/link';
import * as React from 'react';

import guideStyles from '../../styles/Guide.module.css';
import styles from '../../styles/WhatsNew.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import type { Locale } from '../../lib/i18n/config';
import { guideById } from '../../lib/guides';
import {
  adjacentReleases,
  formatReleaseDate,
  highlightIndices,
  type Release,
} from '../../lib/releases';
import ReleaseMedia from './ReleaseMedia';
import WhatsNewShell from './WhatsNewShell';

interface ReleaseArticleProps {
  release: Release;
  locale: Locale;
}

const ReleaseArticle = ({ release, locale }: ReleaseArticleProps): React.ReactElement => {
  const { t, locale: uiLocale } = useT();
  const r = (suffix: string) => t(`release.${release.id}.${suffix}`);
  const guide = release.guide ? guideById(release.guide) : undefined;
  const { newer, older } = adjacentReleases(release.id);

  return (
    <WhatsNewShell>
      <Link href="/whats-new" locale={locale} className={guideStyles.back}>
        <span aria-hidden="true">←</span> {t('whatsNew.allReleases')}
      </Link>

      <p className={guideStyles.eyebrow}>{t('whatsNew.eyebrow')}</p>
      <h1 className={guideStyles.h1}>{r('h1')}</h1>
      <p className={guideStyles.updated}>
        <time dateTime={release.date}>{formatReleaseDate(release.date, uiLocale)}</time>
      </p>
      <p className={guideStyles.intro}>{r('summary')}</p>

      {highlightIndices(release).map((n) => {
        const media = release.media?.[n];
        const title = r(`hl${n}.title`);
        return (
          <section key={n} id={`highlight-${n}`} className={styles.highlight}>
            <h2 className={styles.highlightTitle}>{title}</h2>
            {media && <ReleaseMedia media={media} label={title} />}
            {r(`hl${n}.body`)
              .split(/\n\s*\n/)
              .map((para, i) => (
                <p key={i} className={styles.highlightBody}>{para}</p>
              ))}
          </section>
        );
      })}

      {release.demoSong && <p className={styles.demoNote}>{t('whatsNew.demoSongNote')}</p>}

      {guide && (
        <p className={styles.guideLink}>
          {t('whatsNew.guideLead')}{' '}
          <Link href={`/guide/${guide.slug}`} locale={locale}>
            {t(`guide.${guide.id}.h1`)}
            <span aria-hidden="true"> →</span>
          </Link>
        </p>
      )}

      <section className={guideStyles.cta}>
        <h2 className={guideStyles.ctaTitle}>{t('guide.ctaTitle')}</h2>
        <p className={guideStyles.ctaSub}>{t('guide.ctaSub')}</p>
        <div className={guideStyles.ctaButtons}>
          <Link href="/" className={guideStyles.btnPrimary}>{t('home.nav.host')}</Link>
          <Link href="/" className={guideStyles.btnOutline}>{t('home.nav.join')}</Link>
        </div>
      </section>

      {(newer || older) && (
        <nav className={styles.pager} aria-label={t('whatsNew.allReleases')}>
          {older && (
            <Link href={`/whats-new/${older.slug}`} locale={locale} className={styles.pagerLink}>
              <span className={styles.pagerLabel}>← {t('whatsNew.older')}</span>
              <span className={styles.pagerTitle}>{t(`release.${older.id}.h1`)}</span>
            </Link>
          )}
          {newer && (
            <Link
              href={`/whats-new/${newer.slug}`}
              locale={locale}
              className={`${styles.pagerLink} ${styles.pagerNewer}`}
            >
              <span className={styles.pagerLabel}>{t('whatsNew.newer')} →</span>
              <span className={styles.pagerTitle}>{t(`release.${newer.id}.h1`)}</span>
            </Link>
          )}
        </nav>
      )}
    </WhatsNewShell>
  );
};

export default ReleaseArticle;
