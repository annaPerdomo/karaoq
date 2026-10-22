import Link from 'next/link';
import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { type ChartSong } from '../../lib/songCharts';
import LanguageSwitcher from '../LanguageSwitcher';

interface SongChartPageProps {
  songs: ChartSong[];
  /** Lowercase ISO-3166 code for a country page; undefined for the global page. */
  country?: string;
  countryName?: string;
  updatedAt: string;
  /** The global page's country list (SONG_CHART_COUNTRIES, via getStaticProps); unused on a country page. */
  countries?: readonly string[];
}

const SongChartPage = ({
  songs,
  country,
  countryName,
  updatedAt,
  countries,
}: SongChartPageProps): React.ReactElement => {
  const { t, locale: uiLocale } = useT();
  const isEmpty = songs.length === 0;

  const h1 = country
    ? t('songs.country.h1', { country: countryName ?? country })
    : t('songs.h1');
  const intro = country
    ? t('songs.country.intro', { country: countryName ?? country })
    : t('songs.intro');

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.wordmark}>KaraoQ</Link>
        <LanguageSwitcher />
      </header>

      <article className={styles.article}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">←</span> {t('guide.backHome')}
        </Link>

        <p className={styles.eyebrow}>{t('guide.eyebrow')}</p>
        <h1 className={styles.h1}>{h1}</h1>
        <p className={styles.intro}>{intro}</p>

        {isEmpty ? (
          <p className={styles.sectionText}>{t('songs.updating')}</p>
        ) : (
          <>
            <p className={styles.updated}>
              {t('songs.updated', {
                date: new Intl.DateTimeFormat(uiLocale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(updatedAt)),
              })}
            </p>

            <ol className={styles.songList}>
              {songs.map((song, i) => (
                <li key={`${song.title}::${song.artist}::${i}`} className={styles.songEntry}>
                  <span className={styles.songRank} aria-hidden="true" />
                  <span className={styles.songText}>{song.title} — {song.artist}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>{t('guide.ctaTitle')}</h2>
          <p className={styles.ctaSub}>{t('songs.cta')}</p>
          <div className={styles.ctaButtons}>
            <Link href="/?ref=songs" className={styles.btnPrimary}>{t('home.nav.host')}</Link>
            <Link href="/?ref=songs" className={styles.btnOutline}>{t('home.nav.join')}</Link>
          </div>
        </section>

        {country ? (
          <nav className={styles.countryLinks} aria-label={t('songs.backToAll')}>
            <Link href="/songs" prefetch={false} className={styles.countryLink}>
              <span aria-hidden="true">←</span> {t('songs.backToAll')}
            </Link>
          </nav>
        ) : (
          <nav className={styles.countryLinks} aria-label={t('songs.countries')}>
            <h2 className={styles.countryLinksHeading}>{t('songs.countries')}</h2>
            <ul className={styles.countryLinkList}>
              {(countries ?? []).map((cc) => (
                <li key={cc}>
                  <Link href={`/songs/${cc}`} prefetch={false} className={styles.countryLink}>
                    {new Intl.DisplayNames([uiLocale], { type: 'region' }).of(cc.toUpperCase())}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
    </div>
  );
};

export default SongChartPage;
