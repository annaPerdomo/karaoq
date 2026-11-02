import * as React from "react";
import styles from "../../../styles/ScreenHelp.module.css";
import { useT } from "../../../lib/i18n/I18nProvider";
import { StepSignal, StepSpec } from "../../../lib/screenHelpSteps";
import { GearLinks, LookFor } from "./StepExtras";

const AUTO_ADVANCE_MS = 1400;

export interface StepFlowProps {
  steps: StepSpec[];
  signalValue: (signal: StepSignal) => boolean | null;
  renderText: (step: StepSpec) => React.ReactNode;
  renderAction: (step: StepSpec) => React.ReactNode;
  finish: React.ReactNode;
  onStuck: (step: StepSpec) => void;
  onProgress?: () => void;
}

export function StepFlow({ steps, signalValue, renderText, renderAction, finish, onStuck, onProgress }: StepFlowProps): React.ReactElement {
  const { t } = useT();
  const [index, setIndex] = React.useState(0);
  const [stuck, setStuck] = React.useState(false);
  const [detected, setDetected] = React.useState(false);
  const current = steps[index] as StepSpec | undefined;
  const value = current?.signal ? signalValue(current.signal) : null;
  // Only a change seen on this step advances it, so an already-attached monitor can't skip "plug in".
  // null means not read yet: the first real reading is the baseline, not a change.
  const enteredWithRef = React.useRef<{ index: number; value: boolean | null }>({ index: -1, value: null });
  if (enteredWithRef.current.index !== index) enteredWithRef.current = { index, value };
  else if (enteredWithRef.current.value === null && value !== null) enteredWithRef.current.value = value;

  const onProgressRef = React.useRef(onProgress);
  onProgressRef.current = onProgress;
  const goTo = React.useCallback((i: number) => {
    onProgressRef.current?.();
    setIndex(i);
    setStuck(false);
    setDetected(false);
  }, []);

  // Keyed on the signal, not the step object: flows are rebuilt every render, which would restart the timer.
  const currentSignal = current?.signal;
  React.useEffect(() => {
    if (!currentSignal || value !== true || enteredWithRef.current.value === true) return;
    setDetected(true);
    const timer = setTimeout(() => goTo(index + 1), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [currentSignal, value, index, goTo]);

  if (!current) {
    return (
      <>
        <DoneList steps={steps} upTo={steps.length} renderText={renderText} onPick={goTo} />
        {finish}
      </>
    );
  }

  const alreadyDone = value === true && enteredWithRef.current.value === true;

  return (
    <div className={styles.flow}>
      <DoneList steps={steps} upTo={index} renderText={renderText} onPick={goTo} />
      <p className={styles.progress}>{t("screenHelp.step.progress", { n: index + 1, total: steps.length })}</p>
      <div className={styles.stepCard}>
        <div className={styles.stepText}>{renderText(current)}</div>
        <LookFor visuals={current.look} />
        {renderAction(current)}
        <GearLinks gear={current.gear} />
        {detected && <p className={styles.detected}>✓ {t("screenHelp.step.detected")}</p>}
        {alreadyDone && !detected && <p className={styles.detected}>✓ {t("screenHelp.step.alreadyDone")}</p>}
      </div>
      {stuck && current.fix && (
        <div className={styles.fix} role="note">
          <p className={styles.fixTitle}>{t("screenHelp.step.tryThis")}</p>
          <p className={styles.fixBody}>{t(current.fix)}</p>
          <GearLinks gear={current.fixGear} disclosure={!current.gear?.length} />
        </div>
      )}
      <div className={styles.stepButtons}>
        {/* The pairing form finishes the flow itself by closing the sheet. */}
        {current.action !== "pairForm" && (
          <button type="button" className={styles.nextButton} onClick={() => goTo(index + 1)}>
            {t("screenHelp.step.next")}
          </button>
        )}
        {current.fix && !stuck && (
          <button
            type="button"
            className={styles.stuckButton}
            onClick={() => {
              setStuck(true);
              onProgress?.();
              onStuck(current);
            }}
          >
            {t("screenHelp.step.stuck")}
          </button>
        )}
      </div>
      {index > 0 && (
        <button type="button" className={styles.backButton} onClick={() => goTo(index - 1)}>
          ← {t("screenHelp.step.back")}
        </button>
      )}
    </div>
  );
}

function DoneList({
  steps,
  upTo,
  renderText,
  onPick,
}: {
  steps: StepSpec[];
  upTo: number;
  renderText: (step: StepSpec) => React.ReactNode;
  onPick: (i: number) => void;
}) {
  if (upTo === 0) return null;
  return (
    <ol className={styles.doneList}>
      {steps.slice(0, upTo).map((step, i) => (
        <li key={step.id + i}>
          <button type="button" className={styles.doneItem} onClick={() => onPick(i)}>
            <span className={styles.doneCheck} aria-hidden="true">✓</span>
            <span>{renderText(step)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
