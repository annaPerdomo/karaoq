import styles from "../../styles/Host.module.css";
import { QRCodeSVG } from "qrcode.react";
import { useT } from "../../lib/i18n/I18nProvider";

export function CohostInviteModal({
  cohostUrl,
  cohostDisplayUrl,
  onClose,
  onCopyLink,
}: {
  cohostUrl: string;
  cohostDisplayUrl: string;
  onClose: () => void;
  onCopyLink: () => void;
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
        <h3 className={styles.inviteTitle}>{t('host.cohost.title')}</h3>
        <p className={styles.cohostLede}>
          {t('host.cohost.lede')}
        </p>
        <ol className={styles.cohostSteps}>
          <li>{t('host.cohost.step1')}</li>
          <li>{t('host.cohost.step2')}</li>
          <li>{t('host.cohost.step3')}</li>
          <li>{t('host.cohost.step4')}</li>
        </ol>
        {cohostUrl && (
          <div className={styles.qrModalCode}>
            <QRCodeSVG
              value={cohostUrl}
              size={220}
              bgColor="transparent"
              fgColor="#00f0ff"
              level="M"
            />
          </div>
        )}
        <p className={styles.qrModalScan}>{t('host.scan')}</p>
        <p className={styles.qrModalAlt}>
          {t('host.cohost.sendLink')}
        </p>
        <p className={styles.cohostLink}>
          <strong>{cohostDisplayUrl}</strong>
        </p>
        <button className={styles.qrModalPrint} onClick={onCopyLink}>
          {t('host.cohost.copyLink')}
        </button>
      </div>
    </div>
  );
}
