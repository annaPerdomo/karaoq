import * as React from "react";
import styles from "../../../styles/ScreenHelp.module.css";
import { useT } from "../../../lib/i18n/I18nProvider";
import { PopupState } from "../hooks/useScreenSignals";

export interface VerifyStepProps {
  kind: "test" | "mirror";
  /** null: this route has no display page to wait for. */
  displayLive: boolean | null;
  popup?: PopupState;
  fix?: string;
  onSendTest: () => void;
  onAnswer: (sawIt: boolean) => void;
  successAction?: { label: string; onClick: () => void };
}

export function VerifyStep({ kind, displayLive, popup, fix, onSendTest, onAnswer, successAction }: VerifyStepProps): React.ReactElement {
  const { t } = useT();
  const [phase, setPhase] = React.useState<"idle" | "sent" | "yes" | "no">(kind === "mirror" ? "sent" : "idle");

  if (phase === "yes") {
    return (
      <div className={styles.success} role="status">
        <p className={styles.successTitle}>🎉 {t("screenHelp.verify.successTitle")}</p>
        <p className={styles.successBody}>{t(kind === "mirror" ? "screenHelp.verify.successMirror" : "screenHelp.verify.successBody")}</p>
        {successAction && (
          <button type="button" className={styles.actionButton} onClick={successAction.onClick}>
            {successAction.label}
          </button>
        )}
      </div>
    );
  }

  const send = () => {
    onSendTest();
    setPhase("sent");
  };
  const answer = (sawIt: boolean) => {
    onAnswer(sawIt);
    setPhase(sawIt ? "yes" : "no");
  };

  return (
    <div className={styles.stepCard}>
      <p className={styles.verifyTitle}>{t("screenHelp.verify.title")}</p>
      {popup && <PopupChecks popup={popup} />}
      {kind === "test" && displayLive === false ? (
        <p className={styles.waiting}>{t("screenHelp.verify.waiting")}</p>
      ) : kind === "test" && phase === "idle" ? (
        <button type="button" className={styles.actionButton} onClick={send}>
          {t("screenHelp.verify.send")}
        </button>
      ) : (
        <>
          <p className={styles.stepText}>
            {t(kind === "mirror" ? "screenHelp.verify.askMirror" : "screenHelp.verify.ask")}
          </p>
          <div className={styles.stepButtons}>
            <button type="button" className={styles.nextButton} onClick={() => answer(true)}>
              {t("screenHelp.verify.yes")}
            </button>
            <button type="button" className={styles.stuckButton} onClick={() => answer(false)}>
              {t("screenHelp.verify.no")}
            </button>
          </div>
          {kind === "test" && (
            <button type="button" className={styles.backButton} onClick={send}>
              {t("screenHelp.verify.again")}
            </button>
          )}
        </>
      )}
      {phase === "no" && (
        <div className={styles.fix} role="note">
          <p className={styles.fixTitle}>{t("screenHelp.step.tryThis")}</p>
          {fix && <p className={styles.fixBody}>{t(fix)}</p>}
          <p className={styles.fixBody}>{t("screenHelp.verify.otherWay")}</p>
        </div>
      )}
    </div>
  );
}

function PopupChecks({ popup }: { popup: PopupState }) {
  const { t } = useT();
  const rows: [string, boolean | null][] = [
    ["screenHelp.verify.checkOpen", popup.open],
    ["screenHelp.verify.checkOtherScreen", popup.open ? popup.otherScreen : false],
    ["screenHelp.verify.checkFullscreen", popup.open && popup.fullscreen],
  ];
  return (
    <ul className={styles.checks}>
      {rows.map(([key, ok]) =>
        ok === null ? null : (
          <li key={key} className={ok ? styles.checkOk : styles.checkMissing}>
            <span aria-hidden="true">{ok ? "✓" : "○"}</span> {t(key)}
          </li>
        )
      )}
    </ul>
  );
}
