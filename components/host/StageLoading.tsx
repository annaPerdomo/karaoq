import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

export function StageLoading() {
  const { t } = useT();
  return (
    <div className={styles.stageLoading} aria-live="polite" aria-busy="true">
      <span className={styles.stageEq} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <p className={styles.stageLoadingText}>{t('host.loadingRoom')}</p>
    </div>
  );
}
