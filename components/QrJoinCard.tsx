import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../styles/QrJoinCard.module.css';

interface QrJoinCardProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  onClose?: () => void;
}

const QrJoinCard = ({ joinUrl, joinCode, origin, onClose }: QrJoinCardProps): React.ReactElement => {
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
      <span className={styles.alt}>or join <strong>{displayUrl}</strong> and enter <strong className={styles.code}>{joinCode}</strong></span>
      {onClose && (
        <button className={styles.close} onClick={onClose} title="Hide QR code">
          &times;
        </button>
      )}
    </div>
  );
};

export default QrJoinCard;
