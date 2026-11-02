import * as React from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { createPairing } from '../../app/pairing/createPairing';
import { pollPairing } from '../../app/pairing/pollPairing';
import { formatPairCode, PAIR_TTL_MS } from '../../lib/pairing';

const POLL_MS = 3000;

type Stage = 'idle' | 'showing' | 'expired' | 'error';

export default function TvPairCard({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const { t } = useT();
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>('idle');
  const [creating, setCreating] = React.useState(false);
  const [pairing, setPairing] = React.useState<{ code: string; secret: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  // Computed once on arrival, then re-diffed every tick — never expiresAt
  // minus Date.now(), which drifts when the tab was backgrounded.
  const deadlineRef = React.useRef(0);

  React.useEffect(() => {
    onActiveChange(stage !== 'idle');
  }, [stage, onActiveChange]);

  async function showCode() {
    if (creating) return;
    setCreating(true);
    const created = await createPairing();
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
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = true;
      const result = await pollPairing(pairing!.code, pairing!.secret);
      inFlight = false;
      if (cancelled) return;
      if (result.status === 'claimed') {
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
      if (document.hidden || cancelled) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      poll();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [stage, pairing, router]);

  const cancel = (
    <button type="button" className={styles.textToggle} onClick={() => setStage('idle')}>
      {t('common.cancel')}
    </button>
  );

  if (stage === 'showing' && pairing) {
    return (
      <>
        <div className={styles.pairCode}>{formatPairCode(pairing.code)}</div>
        <p className={styles.tvStartBody}>{t('home.tv.pairSteps')}</p>
        <p className={styles.pairCountdown}>{t('home.tv.expiresIn', { seconds: secondsLeft })}</p>
        {cancel}
      </>
    );
  }

  if (stage === 'expired' || stage === 'error') {
    return (
      <>
        <p className={styles.tvStartBody}>
          {stage === 'expired' ? t('home.tv.codeExpired') : t('home.err.generic')}
        </p>
        <button className={styles.btnOutline} onClick={showCode} disabled={creating} autoFocus>
          {t('home.tv.newCode')}
        </button>
        {cancel}
      </>
    );
  }

  return (
    <button className={styles.btnOutline} onClick={showCode} disabled={creating}>
      {t('home.tv.showCode')}
    </button>
  );
}
