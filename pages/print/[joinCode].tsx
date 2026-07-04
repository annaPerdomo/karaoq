import * as React from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../../styles/Print.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

const PrintPage: NextPage = () => {
  const router = useRouter();
  const { t } = useT();
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
        <title>{t('print.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>KaraoQ</div>

          <div className={styles.label}>{t('print.scanToJoin')}</div>

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
            {t('print.orJoin').split(/(\{url\}|\{code\})/).map((part, i) => {
              if (part === '{url}') return <strong key={i}>{displayUrl}</strong>;
              if (part === '{code}') return <span key={i} className={styles.code}>{joinCode}</span>;
              return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
          </div>

          <div className={styles.actions}>
            <button className={styles.printBtn} onClick={handlePrint}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 6V1.5h9V6" />
                <rect x="1.5" y="6" width="15" height="7.5" rx="1" />
                <path d="M4.5 10.5h9v6h-9z" />
              </svg>
              {t('print.print')}
            </button>
            <button className={styles.backBtn} onClick={handleClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </main>
    </>
  );
};

export default PrintPage;
