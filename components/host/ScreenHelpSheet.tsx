import * as React from "react";
import sheetStyles from "../../styles/Host.module.css";
import styles from "../../styles/ScreenHelp.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { localePath } from "../../lib/i18n/config";
import { screenHelpPlan, ScreenHelpOption } from "../../lib/screenHelp";
import { ScreenHelpOptionBody } from "./screenHelp/ScreenHelpOptionBody";

export interface ScreenHelpSheetProps {
  isOpen: boolean;
  onClose: () => void;
  joinCode: string;
  displayHost: string;
  onPaired: (r: { roomId: string }) => void;
  onOpenTvDisplay: () => void;
  onUseDisplayMode: () => void;
  onPlayHere: () => void;
  onOptionOpened?: (option: ScreenHelpOption) => void;
}

const DESKTOP_PLAN = screenHelpPlan(null);

export function ScreenHelpSheet({
  isOpen,
  onClose,
  joinCode,
  displayHost,
  onPaired,
  onOpenTvDisplay,
  onUseDisplayMode,
  onPlayHere,
  onOptionOpened,
}: ScreenHelpSheetProps): React.ReactElement | null {
  const { t, locale } = useT();
  const [plan, setPlan] = React.useState<typeof DESKTOP_PLAN | null>(null);
  const [expanded, setExpanded] = React.useState<ScreenHelpOption | null>(null);
  const openedRef = React.useRef<Set<ScreenHelpOption>>(new Set());

  const activePlan = plan ?? DESKTOP_PLAN;
  const activeExpanded = expanded ?? activePlan.options[0] ?? null;

  React.useEffect(() => {
    if (!isOpen) return;
    const nextPlan = screenHelpPlan(navigator.userAgent);
    setPlan(nextPlan);
    setExpanded(nextPlan.options[0] ?? null);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      openedRef.current = new Set();
      setPlan(null);
      setExpanded(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    // plan === null: the placeholder desktop plan before the UA effect runs; not a real opened option.
    if (!isOpen || plan === null || !activeExpanded) return;
    if (openedRef.current.has(activeExpanded)) return;
    openedRef.current.add(activeExpanded);
    onOptionOpened?.(activeExpanded);
  }, [isOpen, plan, activeExpanded, onOptionOpened]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={sheetStyles.sheetOverlay} onClick={onClose}>
      <div
        className={sheetStyles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("screenHelp.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={sheetStyles.sheetHandle} />
        <h3 className={styles.title}>{t("screenHelp.title")}</h3>
        <p className={styles.intro}>{t("screenHelp.intro")}</p>
        <div className={styles.optionList}>
          {activePlan.options.map((option, i) => {
            const isExpanded = activeExpanded === option;
            return (
              <section key={option} className={styles.option}>
                <button
                  className={styles.optionHeader}
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(option)}
                >
                  <span className={styles.optionHeaderTitle}>
                    {t(`screenHelp.${option}.title`)}
                    {i === 0 && <span className={styles.chip}>{t("screenHelp.recommended")}</span>}
                  </span>
                </button>
                {isExpanded && (
                  <ScreenHelpOptionBody
                    option={option}
                    plan={activePlan}
                    joinCode={joinCode}
                    displayHost={displayHost}
                    onPaired={onPaired}
                    onOpenTvDisplay={onOpenTvDisplay}
                    onUseDisplayMode={onUseDisplayMode}
                    onPlayHere={onPlayHere}
                  />
                )}
              </section>
            );
          })}
        </div>
        <a
          className={styles.guideLink}
          href={`${localePath(locale)}/guide/karaoke-on-your-tv`}
          target="_blank"
          rel="noopener"
        >
          {t("screenHelp.guide")}
        </a>
        <button className={sheetStyles.sheetDone} onClick={onClose} autoFocus>
          {t("host.transport.modeDone")}
        </button>
      </div>
    </div>
  );
}
