import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { generateCode } from '../../lib/roomCode';
import { createHostedRoom } from '../../app/queue/createHostedRoom';
import setPlayMode from '../../app/queue/setPlayMode';
import { isTvDevice } from '../../lib/calmMotion';

export default function TvStartCard() {
  const { t } = useT();
  const router = useRouter();
  const [isTv, setIsTv] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setIsTv(isTvDevice());
  }, []);

  if (!isTv) return null;

  async function start() {
    if (starting) return;
    setStarting(true);
    setError('');
    const code = generateCode();
    const result = await createHostedRoom(code);
    if (result !== 'ok') {
      setError(t('home.err.generic'));
      setStarting(false);
      return;
    }
    await setPlayMode(code, 'tv');
    router.push(`/display/${code}`);
  }

  return (
    <div className={styles.hostCard}>
      <span className={styles.hostCardKicker}>{t('home.tv.title')}</span>
      <p className={styles.tvStartBody}>{t('home.tv.body')}</p>
      <button
        className={styles.btnPrimary}
        onClick={start}
        disabled={starting}
        autoFocus
      >
        {starting ? t('home.tv.starting') : t('home.tv.start')}
      </button>
      {error && <p className={styles.hostError}>{error}</p>}
    </div>
  );
}
