import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../styles/QrJoinCard.module.css';

interface QrJoinCardProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  onClose?: () => void;
  onPrint?: () => void;
}

const QrJoinCard = ({ joinUrl, joinCode, origin, onClose, onPrint }: QrJoinCardProps): React.ReactElement => {
  const displayUrl = (origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '');

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <QRCodeSVG
          value={joinUrl}
          size={80}
          bgColor="transparent"
          fgColor="#ffffff"
          level="M"
        />
        <span className={styles.label}>SCAN TO JOIN</span>
      </div>
      <span className={styles.alt}>or visit <strong>{displayUrl}</strong> and enter <strong className={styles.code}>{joinCode.toUpperCase()}</strong></span>
      {(onPrint || onClose) && (
        <div className={styles.actions}>
          {onPrint && (
            <button className={styles.print} onClick={onPrint} title="Print QR code">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 6V1.5h9V6" />
                <rect x="1.5" y="6" width="15" height="7.5" rx="1" />
                <path d="M4.5 10.5h9v6h-9z" />
              </svg>
            </button>
          )}
          {onClose && (
            <button className={styles.close} onClick={onClose} title="Hide QR code">
              &times;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default QrJoinCard;
