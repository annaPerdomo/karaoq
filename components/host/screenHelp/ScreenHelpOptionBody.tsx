import * as React from "react";
import styles from "../../../styles/ScreenHelp.module.css";
import { useT } from "../../../lib/i18n/I18nProvider";
import { ConnectTvForm } from "../../pairing/ConnectTvForm";
import { ConnectMethod, connectMethods, ScreenHelpOption, ScreenHelpPlan } from "../../../lib/screenHelp";
import { screenHelpFlow, StepSignal, StepSpec } from "../../../lib/screenHelpSteps";
import { ScreenSignals } from "../hooks/useScreenSignals";
import { MethodPicker } from "./MethodPicker";
import { StepFlow } from "./StepFlow";
import { VerifyStep } from "./VerifyStep";
import { withStrong } from "./withStrong";

export interface StepEvent {
  /** "quickCheck": the confirm card shown above the options when a display is already live. */
  option: ScreenHelpOption | "quickCheck";
  method?: ConnectMethod;
  step: string;
  outcome: "stuck" | "verified" | "failed";
}

export interface ScreenHelpOptionBodyProps {
  option: ScreenHelpOption;
  plan: ScreenHelpPlan;
  joinCode: string;
  displayHost: string;
  signals: ScreenSignals;
  displayConnected: boolean;
  onPaired: (r: { roomId: string }) => void;
  onOpenTvDisplay: () => void;
  onStartCast: () => void;
  onUseDisplayMode: () => void;
  onPlayHere: () => void;
  onSendTest: () => void;
  onStepEvent: (e: StepEvent) => void;
  onVerified: () => void;
}

export function ScreenHelpOptionBody(props: ScreenHelpOptionBodyProps): React.ReactElement {
  const { option, plan, joinCode, displayHost, signals, displayConnected } = props;
  const { t } = useT();
  const scope = option === "laptop" ? "other" : "this";
  const methods = connectMethods(scope, plan.os);
  const hasMethods = option === "popout" || option === "laptop";
  const [method, setMethod] = React.useState<ConnectMethod>(methods[0]);
  const flow = screenHelpFlow(option, plan, method, signals.castAvailable);

  if (option === "onTv" || !flow) {
    return (
      <div className={styles.optionBody}>
        <p className={styles.note}>{t("screenHelp.onTv.body")}</p>
      </div>
    );
  }

  const displayUrl = `${displayHost}/display/${joinCode}`;
  const eventMethod = hasMethods ? method : undefined;

  const signalValue = (signal: StepSignal): boolean | null => {
    switch (signal) {
      case "extended":
        return signals.extended;
      case "popupOpen":
        return signals.popup.open;
      case "popupOtherScreen":
        return signals.popup.otherScreen;
      case "popupFullscreen":
        return signals.popup.fullscreen;
      case "displayConnected":
        return displayConnected;
    }
  };

  const renderText = (step: StepSpec) =>
    withStrong(t(step.text), "url", option === "pair" ? displayHost : displayUrl);

  const renderAction = (step: StepSpec): React.ReactNode => {
    if (step.action === "pairForm") {
      return <ConnectTvForm inline autoFocus={false} roomId={joinCode} onPaired={props.onPaired} />;
    }
    if (!step.action) return null;
    const isCast = step.action === "cast";
    return (
      <div className={styles.stepAction}>
        <button type="button" className={styles.actionButton} onClick={isCast ? props.onStartCast : props.onOpenTvDisplay}>
          {t(isCast ? "screenHelp.popout.castButton" : "host.status.openDisplay")}
        </button>
      </div>
    );
  };

  const finish =
    flow.finish === "paired" ? null : (
      <VerifyStep
        kind={flow.finish}
        displayLive={flow.needsDisplay ? displayConnected : null}
        popup={option === "popout" && method !== "chromecast" ? signals.popup : undefined}
        fix={flow.verifyFix}
        onSendTest={props.onSendTest}
        onAnswer={(sawIt) => {
          props.onStepEvent({ option, method: eventMethod, step: "verify", outcome: sawIt ? "verified" : "failed" });
          if (!sawIt) return;
          if (option === "laptop" || option === "standalone") props.onUseDisplayMode();
          props.onVerified();
        }}
        successAction={flow.finish === "mirror" ? { label: t("screenHelp.mirror.playHere"), onClick: props.onPlayHere } : undefined}
      />
    );

  const note =
    option === "standalone"
      ? t("screenHelp.standalone.note")
      : method === "chromecast" && hasMethods && !(option === "popout" && signals.castAvailable)
        ? t("screenHelp.connect.chromecast.chromeOnly")
        : null;

  return (
    <div className={styles.optionBody}>
      {option === "popout" && <p className={styles.lead}>{t("screenHelp.popout.lead")}</p>}
      {option === "standalone" && <p className={styles.lead}>{t("screenHelp.standalone.lead")}</p>}
      {hasMethods && <MethodPicker methods={methods} value={method} onChange={setMethod} />}
      <StepFlow
        key={`${option}:${method}:${flow.steps.length}`}
        steps={flow.steps}
        signalValue={signalValue}
        renderText={renderText}
        renderAction={renderAction}
        finish={finish}
        onStuck={(step) => props.onStepEvent({ option, method: eventMethod, step: step.id, outcome: "stuck" })}
      />
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
