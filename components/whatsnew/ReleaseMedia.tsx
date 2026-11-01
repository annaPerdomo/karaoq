import * as React from 'react';

import styles from '../../styles/WhatsNew.module.css';
import { calmMotion } from '../../lib/calmMotion';
import type { ReleaseMedia as Media } from '../../lib/releases';
import usePlayWhenVisible from '../home/usePlayWhenVisible';

interface ReleaseMediaProps {
  media: Media;
  label: string;
}

const ReleaseMedia = ({ media, label }: ReleaseMediaProps): React.ReactElement => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [calm, setCalm] = React.useState(true);
  // Read after mount: the server render has no matchMedia and must match it.
  React.useEffect(() => setCalm(calmMotion()), []);

  usePlayWhenVisible(videoRef, media.kind === 'video' && !calm ? media.mp4 : null);

  // Autoplaying loops must be pausable (WCAG 2.2.2).
  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  const ratio = { aspectRatio: `${media.width} / ${media.height}` };
  const shape = media.height > media.width ? styles.mediaPortrait : styles.mediaWide;

  return (
    <div className={`${styles.media} ${shape}`} style={ratio}>
      {media.kind === 'video' ? (
        <video
          ref={videoRef}
          className={styles.mediaEl}
          width={media.width}
          height={media.height}
          poster={media.poster}
          aria-label={label}
          muted
          loop
          playsInline
          preload="none"
          controls={calm}
          {...(calm
            ? {}
            : {
                tabIndex: 0,
                onClick: toggle,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                  }
                },
              })}
        >
          {media.webm && <source src={media.webm} type="video/webm" />}
          <source src={media.mp4} type="video/mp4" />
        </video>
      ) : (
        <img
          className={styles.mediaEl}
          src={media.src}
          width={media.width}
          height={media.height}
          alt={label}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
};

export default ReleaseMedia;
