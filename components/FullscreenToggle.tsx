import * as React from 'react';

import styles from '../styles/FullscreenToggle.module.css';
import { useT } from '../lib/i18n/I18nProvider';

interface FullscreenToggleProps {
  className?: string;
}

// The Fullscreen API is unprefixed in modern browsers but still webkit-prefixed
// in desktop Safari; these helpers paper over both. iOS Safari exposes none of
// them for regular elements (only <video>), so the button hides itself there.
function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function requestFullscreen(el: HTMLElement): Promise<void> | void {
  const target = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  return (target.requestFullscreen ?? target.webkitRequestFullscreen)?.call(target);
}

function exitFullscreen(): Promise<void> | void {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  return (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
}

/**
 * A one-tap fullscreen toggle for the host/display screens — when casting or
 * mirroring to a TV, this hides the browser chrome so KaraoQ fills the display
 * like a native app. Fullscreens the whole document (not a container) so fixed
 * headers and the sidebar come along. Kept self-contained and className-driven:
 * each caller passes the styling for where it sits (the host transport row, the
 * display's floating corner), falling back to a standalone icon-button.
 */
const FullscreenToggle = ({ className }: FullscreenToggleProps): React.ReactElement | null => {
  const { t } = useT();
  // Start unsupported so SSR and the first client render agree (both render
  // nothing); the mount effect flips this on where the API actually exists.
  const [supported, setSupported] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return;
    setSupported(true);

    const onChange = () => setIsFullscreen(!!fullscreenElement());
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    // Some browsers reject fullscreen requests outside a trusted gesture or in
    // an embedded context (an iframe/webview without allowfullscreen); ignore
    // and leave the screen as-is. The rejection arrives as a rejected promise,
    // which a try/catch around a `void` call would not see.
    try {
      if (fullscreenElement()) {
        Promise.resolve(exitFullscreen()).catch(() => {});
      } else {
        Promise.resolve(requestFullscreen(document.documentElement)).catch(() => {});
      }
    } catch {
      // Older engines can also throw synchronously.
    }
  };

  const label = isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen');

  return (
    <button
      type="button"
      className={className ?? styles.btn}
      onClick={toggle}
      title={label}
      aria-label={label}
    >
      {isFullscreen ? (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
    </button>
  );
};

export default FullscreenToggle;
