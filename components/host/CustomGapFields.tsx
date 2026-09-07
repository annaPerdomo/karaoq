import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { AUTO_ADVANCE_GAP_MAX, AUTO_ADVANCE_GAP_MIN } from "../../pages/api/types";

export function clampGap(minutes: number, seconds: number): number {
  const total = Math.floor(minutes) * 60 + Math.floor(seconds);
  if (!Number.isFinite(total)) return AUTO_ADVANCE_GAP_MIN;
  return Math.min(AUTO_ADVANCE_GAP_MAX, Math.max(AUTO_ADVANCE_GAP_MIN, total));
}

/** Commits on blur or Enter, not per keystroke: a half-typed "1" would re-time a running count-in. */
export function CustomGapFields({
  gapSeconds,
  onCommit,
}: {
  gapSeconds: number;
  onCommit: (gapSeconds: number) => void;
}): React.ReactElement {
  const { t } = useT();
  const [min, setMin] = React.useState(String(Math.floor(gapSeconds / 60)));
  const [sec, setSec] = React.useState(String(gapSeconds % 60));
  const committed = React.useRef(gapSeconds);

  // Follow another device's change, but not our own commit echoing back: that
  // would clobber the field the host tabbed into next.
  React.useEffect(() => {
    if (gapSeconds === committed.current) return;
    committed.current = gapSeconds;
    setMin(String(Math.floor(gapSeconds / 60)));
    setSec(String(gapSeconds % 60));
  }, [gapSeconds]);

  const commit = () => {
    const next = clampGap(Number(min) || 0, Number(sec) || 0);
    setMin(String(Math.floor(next / 60)));
    setSec(String(next % 60));
    if (next === committed.current) return;
    committed.current = next;
    onCommit(next);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className={styles.gapFields}>
      <label className={styles.gapField}>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={AUTO_ADVANCE_GAP_MAX / 60}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          aria-label={t("host.settings.gapMinutes")}
        />
        <span>{t("host.settings.gapMinutes")}</span>
      </label>
      <label className={styles.gapField}>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          value={sec}
          onChange={(e) => setSec(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          aria-label={t("host.settings.gapSeconds")}
        />
        <span>{t("host.settings.gapSeconds")}</span>
      </label>
      <span className={styles.gapHint}>
        {t("host.settings.gapRange", { max: AUTO_ADVANCE_GAP_MAX / 60 })}
      </span>
    </div>
  );
}
