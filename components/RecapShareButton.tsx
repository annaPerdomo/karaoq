import * as React from 'react';

import { useT } from '../lib/i18n/I18nProvider';
import { SITE_URL } from '../lib/i18n/config';
import { buildNightRecap } from '../lib/nightRecap';
import { QueueEntry } from '../pages/api/types';
import styles from '../styles/RecapShareButton.module.css';

export default function RecapShareButton({
  queue,
  activeVideoIndex,
  className,
}: {
  queue: QueueEntry[];
  activeVideoIndex: number;
  className?: string;
}): React.ReactElement | null {
  const { t, tn } = useT();
  const [copied, setCopied] = React.useState(false);
  const recap = buildNightRecap(queue, activeVideoIndex, Date.now());

  if (recap.songs < 3) return null;

  async function copyToClipboard(text: string, url: string) {
    if (typeof navigator.clipboard?.writeText !== 'function') return;
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* writeText can still throw (e.g. permission denied) */
    }
  }

  async function handleShare() {
    const text =
      tn('recap.text', recap.singers, { songs: recap.songs, singers: recap.singers }) +
      (recap.star ? ` ${t('recap.star', { name: recap.star })}` : '');
    const url = `${SITE_URL}/?ref=recap`;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }

    await copyToClipboard(text, url);
  }

  return (
    <button
      type="button"
      className={`${styles.recapShareBtn} ${className ?? ''}`}
      onClick={handleShare}
    >
      {copied ? t('recap.copied') : t('recap.share')}
    </button>
  );
}
