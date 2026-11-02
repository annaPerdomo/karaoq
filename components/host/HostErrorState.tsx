import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

/** Not-found (`error` set, terminal) or a retryable load error. */
export function HostErrorState({
  error,
  onGoHome,
  onRetry,
}: {
  error: string | null;
  onGoHome: () => void;
  onRetry: () => void;
}) {
  const { t } = useT();
  if (error) {
    return (
      <main className={styles.main}>
        <div className={styles.errorCard}>
          <h2>{t('host.error.title')}</h2>
          <p>{error}</p>
          <button className={styles.btn} onClick={onGoHome}>
            {t('common.goHome')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.errorCard}>
        <h2>{t('common.connectionErrorTitle')}</h2>
        <p>{t('common.connectionErrorBody')}</p>
        <button className={styles.btn} onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    </main>
  );
}
