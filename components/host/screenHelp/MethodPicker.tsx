import * as React from "react";
import styles from "../../../styles/ScreenHelp.module.css";
import { useT } from "../../../lib/i18n/I18nProvider";
import { ConnectMethod } from "../../../lib/screenHelp";

export function MethodPicker({
  methods,
  value,
  onChange,
  nearby,
}: {
  methods: ConnectMethod[];
  value: ConnectMethod;
  nearby: (m: ConnectMethod) => boolean;
  onChange: (m: ConnectMethod) => void;
}): React.ReactElement {
  const { t } = useT();
  return (
    <>
      <p className={styles.question}>{t("screenHelp.connect.question")}</p>
      <div className={styles.methods} role="radiogroup" aria-label={t("screenHelp.connect.question")}>
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            className={`${styles.method} ${value === m ? styles.methodActive : ""}`}
            onClick={() => onChange(m)}
          >
            {t(`screenHelp.connect.${m}`)}
            {nearby(m) && " "}
            {nearby(m) && <span className={styles.methodNearby}>{t("screenHelp.nearby.method")}</span>}
          </button>
        ))}
      </div>
    </>
  );
}
