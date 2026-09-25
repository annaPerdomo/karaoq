import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { isTvDevice } from '../../lib/calmMotion';
import { createPairing } from '../../app/pairing/createPairing';
import { pollPairing } from '../../app/pairing/pollPairing';
import { formatPairCode, PAIR_TTL_MS } from '../../lib/pairing';
import { setRoomKey } from '../../lib/roomKeyStore';

const POLL_MS = 2000;

type Stage = 'idle' | 'showing' | 'expired' | 'error';

export default function TvPairCard() {
  const { t } = useT();
  const router = useRouter();
  const [isTv, setIsTv] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>('idle');
  const [creating, setCreating] = React.useState(false);
  const [pairing, setPairing] = React.useState<{ code: string; secret: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  // Computed once on arrival, then re-diffed every tick — never expiresAt
  // minus Date.now(), which drifts when the tab was backgrounded.
  const deadlineRef = React.useRef(0);

  React.useEffect(() => {
    setIsTv(isTvDevice());
  }, []);

  async function showCode() {
    if (creating) return;
    setCreating(true);
    const created = await createPairing('screen');
    setCreating(false);
    if (!created) {
      setStage('error');
      return;
    }
    deadlineRef.current = performance.now() + PAIR_TTL_MS;
    setSecondsLeft(Math.round(PAIR_TTL_MS / 1000));
    setPairing({ code: created.code, secret: created.secret });
    setStage('showing');
  }

  React.useEffect(() => {
    if (stage !== 'showing') return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((deadlineRef.current - performance.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [stage]);

  React.useEffect(() => {
    if (stage !== 'showing' || !pairing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const result = await pollPairing(pairing!.code, pairing!.secret);
      if (cancelled) return;
      if (result.status === 'claimed') {
        setRoomKey(result.roomId, pairing!.secret, 'display');
        router.push(`/display/${result.roomId}`);
        return;
      }
      if (result.status === 'expired') {
        setStage('expired');
        return;
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (cancelled || document.hidden) return;
      timer = setTimeout(poll, POLL_MS);
    }

    function onVisibilityChange() {
      if (!document.hidden && !cancelled) poll();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [stage, pairing, router]);

  if (!isTv) return null;

  if (stage === 'showing' && pairing) {
    return (
      <div className={styles.hostCard}>
        <span className={styles.hostCardKicker}>{t('home.tv.title')}</span>
        <div className={styles.pairCode}>{formatPairCode(pairing.code)}</div>
        <p className={styles.tvStartBody}>{t('home.tv.pairSteps')}</p>
        <p className={styles.pairCountdown}>{t('home.tv.expiresIn', { seconds: secondsLeft })}</p>
      </div>
    );
  }

  if (stage === 'expired' || stage === 'error') {
    return (
      <div className={styles.hostCard}>
        <span className={styles.hostCardKicker}>{t('home.tv.title')}</span>
        <p className={styles.tvStartBody}>
          {stage === 'expired' ? t('home.tv.codeExpired') : t('home.err.generic')}
        </p>
        <button className={styles.btnPrimary} onClick={showCode} disabled={creating} autoFocus>
          {t('home.tv.newCode')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.hostCard}>
      <span className={styles.hostCardKicker}>{t('home.tv.title')}</span>
      <p className={styles.tvStartBody}>{t('home.tv.pairBody')}</p>
      <button className={styles.btnPrimary} onClick={showCode} disabled={creating} autoFocus>
        {t('home.tv.showCode')}
      </button>
    </div>
  );
}
