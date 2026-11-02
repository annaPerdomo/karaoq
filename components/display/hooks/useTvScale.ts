import * as React from 'react';
import { isTvDevice } from '../../../lib/calmMotion';
import { TV_SIDEBAR_BOOST, tvScale } from '../../../lib/tvScale';

function initialTvScale(): number {
  if (typeof document === 'undefined') return 1;
  const parsed = parseFloat(document.documentElement.style.getPropertyValue('--tv-scale'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function initiallyScaled(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-tv-scaled');
}

export function useTvScale(): { scale: number; sidebarScale: number } {
  const [scale, setScale] = React.useState(initialTvScale);
  const [scaled, setScaled] = React.useState(initiallyScaled);

  React.useEffect(() => {
    if (!isTvDevice()) return;
    const root = document.documentElement;
    const update = () => {
      const next = tvScale(window.innerWidth, window.innerHeight);
      setScale(next);
      setScaled(true);
      root.style.setProperty('--tv-scale', String(next));
      root.setAttribute('data-tv-scaled', '1');
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      root.style.removeProperty('--tv-scale');
      root.removeAttribute('data-tv-scaled');
    };
  }, []);

  return { scale, sidebarScale: scaled ? scale * TV_SIDEBAR_BOOST : scale };
}
