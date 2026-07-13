import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../styles/QrJoinCard.module.css';
import { useT } from '../lib/i18n/I18nProvider';

interface QrJoinCardProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  onClose?: () => void;
  onPrint?: () => void;
  size?: "small" | "normal" | "large";
}

const QR_PIXELS: Record<"small" | "normal" | "large", number> = {
  small: 48,
  normal: 80,
  large: 120,
};

const QrJoinCard = ({ joinUrl, joinCode, origin, onClose, onPrint, size = "normal" }: QrJoinCardProps): React.ReactElement => {
  const { t } = useT();
  const displayUrl = (origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '');

  // "or visit {url} and enter {code}" — split on the placeholders so the URL
  // and code keep their emphasis while translators control word order.
  const altParts = t('qr.orVisit').split(/(\{url\}|\{code\})/);

  return (
    <div className={`${styles.card} ${size !== 'normal' ? styles[`card${size === 'small' ? 'Small' : 'Large'}`] : ''}`}>
      <div className={styles.top}>
        <QRCodeSVG
          value={joinUrl}
          size={QR_PIXELS[size]}
          bgColor="transparent"
          fgColor="#ffffff"
          level="M"
        />
        <span className={styles.label}>{t('qr.scanToJoin')}</span>
      </div>
      <span className={styles.alt}>
        {altParts.map((part, i) => {
          if (part === '{url}') return <strong key={i}>{displayUrl}</strong>;
          if (part === '{code}') return <strong key={i} className={styles.code}>{joinCode.toUpperCase()}</strong>;
          return <React.Fragment key={i}>{part}</React.Fragment>;
        })}
      </span>
      {(onPrint || onClose) && (
        <div className={styles.actions}>
          {onPrint && (
            <button className={styles.print} onClick={onPrint} title={t('qr.print')}>
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 6V1.5h9V6" />
                <rect x="1.5" y="6" width="15" height="7.5" rx="1" />
                <path d="M4.5 10.5h9v6h-9z" />
              </svg>
            </button>
          )}
          {onClose && (
            <button className={styles.close} onClick={onClose} title={t('qr.hide')}>
              &times;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default QrJoinCard;
