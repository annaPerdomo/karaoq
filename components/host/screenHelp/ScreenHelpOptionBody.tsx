import * as React from "react";
import sheetStyles from "../../../styles/Host.module.css";
import styles from "../../../styles/ScreenHelp.module.css";
import { useT } from "../../../lib/i18n/I18nProvider";
import { ConnectTvForm } from "../../pairing/ConnectTvForm";
import { ScreenHelpOption, ScreenHelpPlan } from "../../../lib/screenHelp";

function withStrong(text: string, placeholder: string, value: string): React.ReactNode {
  const pattern = new RegExp(`(\\{${placeholder}\\})`);
  return text.split(pattern).map((part, i) =>
    part === `{${placeholder}}` ? (
      <strong key={i}>{value}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

export interface ScreenHelpOptionBodyProps {
  option: ScreenHelpOption;
  plan: ScreenHelpPlan;
  joinCode: string;
  displayHost: string;
  onPaired: (r: { roomId: string }) => void;
  onOpenTvDisplay: () => void;
  onUseDisplayMode: () => void;
  onPlayHere: () => void;
}

export function ScreenHelpOptionBody({
  option,
  plan,
  joinCode,
  displayHost,
  onPaired,
  onOpenTvDisplay,
  onUseDisplayMode,
  onPlayHere,
}: ScreenHelpOptionBodyProps): React.ReactElement {
  const { t } = useT();

  if (option === "pair") {
    return (
      <div className={styles.optionBody}>
        <ol className={styles.steps}>
          <li>{withStrong(t("screenHelp.pair.step1"), "url", displayHost)}</li>
          <li>{t("screenHelp.pair.step2")}</li>
          <li>{t("screenHelp.pair.step3")}</li>
        </ol>
        <ConnectTvForm inline autoFocus={false} roomId={joinCode} onPaired={onPaired} />
      </div>
    );
  }

  if (option === "mirror") {
    const step1 = plan.mirror === "airplay" ? "screenHelp.mirror.airplay.step1" : "screenHelp.mirror.cast.step1";
    const step2 = plan.mirror === "airplay" ? "screenHelp.mirror.airplay.step2" : "screenHelp.mirror.cast.step2";
    return (
      <div className={styles.optionBody}>
        <ol className={styles.steps}>
          <li>{t(step1)}</li>
          <li>{t(step2)}</li>
          <li>{t("screenHelp.mirror.step3")}</li>
        </ol>
        <button className={sheetStyles.switchModeLink} onClick={onPlayHere}>
          {t("screenHelp.mirror.playHere")}
        </button>
        <p className={styles.note}>{t("screenHelp.mirror.note")}</p>
      </div>
    );
  }

  if (option === "laptop") {
    const url = `${displayHost}/display/${joinCode}`;
    return (
      <div className={styles.optionBody}>
        <ol className={styles.steps}>
          <li>{t("screenHelp.laptop.step1")}</li>
          <li>{withStrong(t("screenHelp.laptop.step2"), "url", url)}</li>
          <li>{t("screenHelp.laptop.step3")}</li>
        </ol>
        <button className={sheetStyles.switchModeLink} onClick={onUseDisplayMode}>
          {t("screenHelp.laptop.useIt")}
        </button>
      </div>
    );
  }

  if (option === "popout") {
    return (
      <div className={styles.optionBody}>
        <ol className={styles.steps}>
          <li>
            {t("screenHelp.popout.step1")}
            <div className={styles.stepAction}>
              <button className={sheetStyles.switchModeLink} onClick={onOpenTvDisplay}>
                {t("host.status.openDisplay")}
              </button>
            </div>
          </li>
          <li>{t("screenHelp.popout.step2")}</li>
        </ol>
      </div>
    );
  }

  return (
    <div className={styles.optionBody}>
      <p className={styles.note}>{t("screenHelp.onTv.body")}</p>
    </div>
  );
}
