import * as React from "react";
import styles from "../../styles/Host.module.css";
import { QRCodeSVG } from "qrcode.react";
import { useT } from "../../lib/i18n/I18nProvider";

export function QrModal({
  joinUrl,
  displayUrl,
  joinCode,
  onPrintQr,
  onClose,
}: {
  joinUrl: string;
  displayUrl: string;
  joinCode: string | undefined;
  onPrintQr: () => void;
  onClose: () => void;
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
        <div className={styles.qrModalCode}>
          <QRCodeSVG
            value={joinUrl}
            size={260}
            bgColor="transparent"
            fgColor="#ffffff"
            level="M"
          />
        </div>
        <p className={styles.qrModalScan}>{t('host.scanToJoin')}</p>
        <p className={styles.qrModalAlt}>
          {t('host.qr.orVisitEnterCode').split(/(\{url\}|\{code\})/).map((part, i) => {
            if (part === '{url}') return <strong key={i}>{displayUrl}</strong>;
            if (part === '{code}') return <strong key={i} className={styles.qrShelfCode}>{(joinCode || "").toUpperCase()}</strong>;
            return <React.Fragment key={i}>{part}</React.Fragment>;
          })}
        </p>
        <button className={styles.qrModalPrint} onClick={onPrintQr}>
          {t('host.qr.printCode')}
        </button>
      </div>
    </div>
  );
}
