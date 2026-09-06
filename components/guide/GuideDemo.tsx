import Link from 'next/link';
import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { POSTER } from '../home/heroFilm';
import useFilmSource from '../home/useFilmSource';
import usePlayWhenVisible from '../home/usePlayWhenVisible';

/**
 * The landing hero's product film, inside a guide's "create a room" step (see
 * `Guide.demoStep`). Same encode and per-engine source pick as the hero.
 */
const GuideDemo = (): React.ReactElement => {
  const { t } = useT();
  const { src, videoRef, onLoadedData, onError } = useFilmSource('GuideDemo');

  usePlayWhenVisible(videoRef, src);

  return (
    <figure className={styles.demo}>
      <div className={styles.demoStage} aria-hidden="true">
        <div className={styles.demoGlow} />
        {src ? (
          <video
            className={styles.demoMedia}
            key={src}
            ref={videoRef}
            src={src}
            muted
            loop
            playsInline
            preload="none"
            poster={POSTER}
            onLoadedData={onLoadedData}
            onError={onError}
          />
        ) : (
          <img className={styles.demoMedia} src={POSTER} alt="" />
        )}
      </div>
      <figcaption className={styles.demoCaption}>
        {t('guide.demoCaption')}{' '}
        <Link href="/" className={styles.demoLink}>
          {t('guide.demoLink')}
          <span aria-hidden="true"> →</span>
        </Link>
      </figcaption>
    </figure>
  );
};

export default GuideDemo;
