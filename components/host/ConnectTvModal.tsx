import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { ConnectTvForm } from "../pairing/ConnectTvForm";

export function ConnectTvModal({
  roomId,
  onClose,
  onPaired,
}: {
  roomId: string;
  onClose: () => void;
  onPaired: (r: { kind: "screen" | "remote"; roomId: string }) => void;
}) {
  const { t } = useT();
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.invitePanel} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.qrModalClose}
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          &times;
        </button>
        <h3 className={styles.inviteTitle}>{t('pair.menuItem')}</h3>
        <ConnectTvForm roomId={roomId} onPaired={onPaired} />
      </div>
    </div>
  );
}
