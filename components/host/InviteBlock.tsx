import { QRCodeSVG } from "qrcode.react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

export function InviteBlock({
  joinUrl,
  displayUrl,
  joinCode,
  onPrintQr,
}: {
  joinUrl: string;
  displayUrl: string;
  joinCode: string | undefined;
  onPrintQr: () => void;
}) {
  const { t } = useT();
  return (
    <div className={styles.emptyInvite}>
      <span className={styles.emptyInviteLabel}>
        {t('host.empty.inviteLabel')}
      </span>
      <div className={styles.emptyInviteRow}>
        {joinUrl && (
          <div className={styles.emptyInviteQr}>
            <QRCodeSVG
              value={joinUrl}
              size={92}
              bgColor="transparent"
              fgColor="#ffffff"
              level="M"
            />
          </div>
        )}
        <div className={styles.emptyInviteInfo}>
          <div className={styles.emptyJoinKicker}>
            {t('host.empty.scanVisit', { url: displayUrl })}
          </div>
          <div className={styles.emptyInviteCode}>
            {joinCode?.toUpperCase()}
          </div>
          <button className={styles.emptyJoinPrint} onClick={onPrintQr}>
            {t('host.empty.printCode')}
          </button>
        </div>
      </div>
    </div>
  );
}
