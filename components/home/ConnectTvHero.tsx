import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { isTvDevice } from '../../lib/calmMotion';
import { getLastHostedRoom } from '../../lib/lastRoom';
import { getRoomKey } from '../../lib/roomKeyStore';
import { ConnectTvForm } from '../pairing/ConnectTvForm';

function hostedRoomId(): string | undefined {
  const last = getLastHostedRoom();
  return last && getRoomKey(last.code)?.role === 'host' ? last.code : undefined;
}

export default function ConnectTvHero({
  onNeedsRoom,
  onPaired,
}: {
  onNeedsRoom: () => Promise<string | null>;
  onPaired: (r: { kind: 'screen' | 'remote'; roomId: string }) => void;
}) {
  const { t } = useT();
  const [isTv, setIsTv] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    setIsTv(isTvDevice());
  }, []);

  if (isTv) return null;

  return (
    <div className={styles.connectTvHero}>
      {!expanded ? (
        <button
          type="button"
          className={styles.textToggle}
          onClick={() => setExpanded(true)}
        >
          {t('pair.heroLink')}
        </button>
      ) : (
        <ConnectTvForm roomId={hostedRoomId()} onNeedsRoom={onNeedsRoom} onPaired={onPaired} />
      )}
    </div>
  );
}
