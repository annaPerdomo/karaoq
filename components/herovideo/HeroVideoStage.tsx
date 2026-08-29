import * as React from 'react';
import styles from '../../styles/HeroVideo.module.css';
import BigScreen from './BigScreen';
import GuestPhone from './GuestPhone';
import { DUR_MS, GUESTS } from './timeline';

declare global {
  interface Window {
    __kqHeroSeek?: (ms: number) => Promise<boolean>;
    __kqHeroReady?: boolean;
  }
}

// Everything renders as a pure function of `t`:
//  - live preview: requestAnimationFrame loop
//  - ?t=<ms>: hold a single frame (design checks)
//  - ?capture=1: no clock; the capture script drives window.__kqHeroSeek
export default function HeroVideoStage() {
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('capture')) {
      window.__kqHeroSeek = (ms: number) =>
        new Promise((resolve) => {
          setT(((ms % DUR_MS) + DUR_MS) % DUR_MS);
          // Two rAFs: one for React to commit, one for the paint to land.
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        });
      window.__kqHeroReady = true;
      return;
    }
    const hold = params.get('t');
    if (hold !== null) {
      setT(((Number(hold) % DUR_MS) + DUR_MS) % DUR_MS);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      setT((now - t0) % DUR_MS);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={styles.stage}>
      <div className={styles.tvGroup}>
        <BigScreen t={t} />
      </div>
      {GUESTS.map((guest) => (
        <GuestPhone key={guest.name} t={t} guest={guest} />
      ))}
    </div>
  );
}
