import * as React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../../styles/Print.module.css';

const PrintPage: NextPage = () => {
  const router = useRouter();
  const joinCode = router.query.joinCode as string | undefined;
  const [origin, setOrigin] = React.useState('');

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const joinUrl = origin ? `${origin}/sing/${joinCode}` : '';
  const displayUrl = (origin || 'karaoq.live').replace(/^https?:\/\/(www\.)?/, '');

  function handlePrint() {
    window.print();
  }

  function handleClose() {
    if (window.history.length > 1) {
      router.back();
    } else {
      window.close();
    }
  }

  if (!joinCode) return null;

  return (
    <>
      <Head>
        <title>KaraoQ — Print QR Code</title>
      </Head>
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>KaraoQ</div>

          <div className={styles.label}>Scan to join</div>

          {joinUrl && (
            <div className={styles.qr}>
              <QRCodeSVG
                value={joinUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
          )}
          <div className={styles.url}>
            or join <strong>{displayUrl}</strong> and enter <span className={styles.code}>{joinCode}</span>
          </div>

          <div className={styles.actions}>
            <button className={styles.printBtn} onClick={handlePrint}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 6V1.5h9V6" />
                <rect x="1.5" y="6" width="15" height="7.5" rx="1" />
                <path d="M4.5 10.5h9v6h-9z" />
              </svg>
              Print
            </button>
            <button className={styles.backBtn} onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </main>
    </>
  );
};

export default PrintPage;
