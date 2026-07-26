import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../styles/QrJoinCard.module.css';
import { useT } from '../lib/i18n/I18nProvider';
import { QR_SIZE_PX } from '../pages/api/types';

interface QrJoinCardProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  onClose?: () => void;
  onPrint?: () => void;
  size?: "small" | "normal" | "large";
  sizePx?: number;
  resizeHandle?: React.ReactNode;
}

const QrJoinCard = ({ joinUrl, joinCode, origin, onClose, onPrint, size = "normal", sizePx, resizeHandle }: QrJoinCardProps): React.ReactElement => {
  const { t } = useT();
  const displayUrl = (origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '');

  const altParts = t('qr.orVisit').split(/(\{url\}|\{code\})/);

  // The coarse size buckets remain for displays running code that predates
  // fine-grained (sizePx) sizing.
  const scaled = sizePx !== undefined;
  const textScale = scaled ? Math.min(1.4, 1 + (sizePx / QR_SIZE_PX.normal - 1) * 0.2) : 1;
  return (
    <div
      className={`${styles.card} ${!scaled && size !== 'normal' ? styles[`card${size === 'small' ? 'Small' : 'Large'}`] : ''}`}
      style={scaled ? ({ '--qr-scale': textScale } as React.CSSProperties) : undefined}
    >
      <div className={styles.top}>
        <span className={styles.qrBox}>
          <QRCodeSVG
            value={joinUrl}
            size={sizePx ?? QR_SIZE_PX[size]}
            bgColor="transparent"
            fgColor="#ffffff"
            level="M"
          />
          {resizeHandle}
        </span>
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
