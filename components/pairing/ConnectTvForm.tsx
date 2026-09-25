import * as React from 'react';
import styles from '../../styles/Pairing.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { claimPairing } from '../../app/pairing/claimPairing';
import { isPairCode } from '../../lib/pairing';

export interface ConnectTvFormProps {
  roomId?: string;
  onPaired: (r: { kind: 'screen' | 'remote'; roomId: string }) => void;
  onNeedsRoom?: () => Promise<string | null>;
}

type ErrorKey = 'expired' | 'invalid' | 'generic' | 'rateLimited';

export function ConnectTvForm({ roomId, onPaired, onNeedsRoom }: ConnectTvFormProps) {
  const { t } = useT();
  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<ErrorKey | null>(null);
  // A needs-room retry mints a real room — remembered here so a second failed
  // attempt (wrong code, expired code) reuses it instead of minting another.
  const createdRoomRef = React.useRef<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const cleaned = code.replace(/[\s-]/g, '');
    if (!isPairCode(cleaned)) {
      setError('invalid');
      return;
    }
    setError(null);
    setSubmitting(true);

    let result = await claimPairing(cleaned, roomId ?? createdRoomRef.current ?? undefined);
    if (!result.ok && result.reason === 'needs-room' && onNeedsRoom) {
      const newRoomId = await onNeedsRoom();
      if (!newRoomId) {
        setError('generic');
        setSubmitting(false);
        return;
      }
      createdRoomRef.current = newRoomId;
      result = await claimPairing(cleaned, newRoomId);
    }

    setSubmitting(false);
    if (result.ok) {
      onPaired({ kind: result.kind, roomId: result.roomId });
      return;
    }
    setError(
      result.reason === 'expired' || result.reason === 'needs-room'
        ? 'expired'
        : result.reason === 'rate-limited'
          ? 'rateLimited'
          : 'generic'
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.codeInput}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000 000"
        aria-label={t('pair.connect')}
        maxLength={7}
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
      />
      <button className={styles.connectBtn} type="submit" disabled={submitting}>
        {t('pair.connect')}
      </button>
      {error && <p className={styles.error}>{t(`pair.err.${error}`)}</p>}
    </form>
  );
}
