import * as React from "react";
import styles from "../../styles/ScreenTest.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

export default function ScreenTestCard(): React.ReactElement {
  const { t } = useT();
  return (
    <div className={styles.overlay} role="status" aria-live="assertive">
      <div className={styles.card}>
        <div className={styles.wave} aria-hidden="true">👋</div>
        <div className={styles.title}>{t("screenTest.title")}</div>
        <div className={styles.body}>{t("screenTest.body")}</div>
      </div>
    </div>
  );
}
