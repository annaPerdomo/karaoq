import Link from 'next/link';
import * as React from 'react';

import styles from '../../styles/WhatsNew.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import type { Locale } from '../../lib/i18n/config';
import {
  formatReleaseDate,
  highlightIndices,
  leadHighlight,
  mediaStill,
  type Release,
} from '../../lib/releases';

interface ReleaseCardProps {
  release: Release;
  locale: Locale;
}

// Headline before the still: a card that opened on the image read as an unexplained screenshot.
const ReleaseCard = ({ release, locale }: ReleaseCardProps): React.ReactElement => {
  const { t, locale: uiLocale } = useT();
  const r = (suffix: string) => t(`release.${release.id}.${suffix}`);
  const lead = leadHighlight(release);

  return (
    <li className={styles.card}>
      <Link href={`/whats-new/${release.slug}`} locale={locale} className={styles.cardLink}>
        <time className={styles.cardDate} dateTime={release.date}>
          {formatReleaseDate(release.date, uiLocale)}
        </time>
        <h2 className={styles.cardTitle}>{r('h1')}</h2>
        {lead && (
          <figure className={styles.cardFigure}>
            <div
              className={styles.cardFrame}
              style={{ '--still': `url(${mediaStill(lead.media)})` } as React.CSSProperties}
            >
              <img
                className={styles.cardStill}
                src={mediaStill(lead.media)}
                width={lead.media.width}
                height={lead.media.height}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption className={styles.cardLabel}>
              <span className={styles.cardPlay} aria-hidden="true">▶</span>
              {r(`hl${lead.n}.title`)}
            </figcaption>
          </figure>
        )}
        <p className={styles.cardSummary}>{r('summary')}</p>
        <ul className={styles.cardHighlights}>
          {highlightIndices(release).map((n) => (
            <li key={n}>{r(`hl${n}.title`)}</li>
          ))}
        </ul>
        <span className={styles.cardMore}>
          {t('whatsNew.readMore')}
          <span aria-hidden="true"> →</span>
        </span>
      </Link>
    </li>
  );
};

export default ReleaseCard;
