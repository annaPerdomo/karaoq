import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../../styles/Display.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { SITE_URL } from '../../lib/i18n/config';

export default function HostFromPhoneCard({
  origin,
  joinCode,
  onHide,
}: {
  origin: string;
  joinCode: string;
  onHide: () => void;
}) {
  const { t } = useT();
  const hostUrl = `${origin || SITE_URL}/host/${joinCode}`;

  return (
    <div className={styles.hostFromPhoneCard}>
      <div className={styles.hostFromPhoneHeader}>
        <span className={styles.hostFromPhoneTitle}>{t('display.hostFromPhone.title')}</span>
        <button className={styles.hostFromPhoneHide} onClick={onHide}>
          {t('display.hostFromPhone.hide')}
        </button>
      </div>
      <p className={styles.hostFromPhoneBody}>{t('display.hostFromPhone.body')}</p>
      <QRCodeSVG
        className={styles.hostFromPhoneQr}
        value={hostUrl}
        size={200}
        bgColor="transparent"
        fgColor="#ffffff"
        level="M"
      />
    </div>
  );
}
