import * as React from "react";
import styles from "../../styles/Display.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { formatPairCode } from "../../lib/pairing";
import { ConnectPhoneStage } from "./hooks/useConnectPhone";

export function ConnectPhonePanel({
  stage,
  code,
  secondsLeft,
  onClose,
  onRetry,
}: {
  stage: ConnectPhoneStage;
  code: string;
  secondsLeft: number;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { t } = useT();
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
  }, [stage]);

  return (
    <div className={styles.connectPhonePanel} data-remote="connect-phone-panel">
      {stage === "claimed" ? (
        <p className={styles.connectPhoneDone}>{t("display.connectPhone.done")}</p>
      ) : stage === "expired" || stage === "error" ? (
        <>
          <p className={styles.connectPhoneBody}>
            {stage === "expired" ? t("home.tv.codeExpired") : t("home.err.generic")}
          </p>
          <button className={styles.connectPhoneRetry} onClick={onRetry}>
            {t("home.tv.newCode")}
          </button>
        </>
      ) : code ? (
        <>
          <p className={styles.connectPhoneBody}>{t("display.connectPhone.lead")}</p>
          <div className={styles.connectPhoneCode}>{formatPairCode(code)}</div>
          <p className={styles.connectPhoneBody}>{t("display.connectPhone.steps")}</p>
          <p className={styles.connectPhoneCountdown}>{t("home.tv.expiresIn", { seconds: secondsLeft })}</p>
        </>
      ) : (
        <p className={styles.connectPhoneBody}>{t("host.loading")}</p>
      )}
      <button
        ref={closeRef}
        className={styles.connectPhoneClose}
        onClick={onClose}
        data-remote="connect-phone-close"
      >
        {t("display.connectPhone.close")}
      </button>
    </div>
  );
}
