import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import {
  AUTO_ADVANCE_GAPS,
  AutoAdvance,
  SONG_LIMIT_OPTIONS,
} from "../../pages/api/types";

/** Gear-menu "Playback" group. Both rows are shared with the whole room. */
export function AutoAdvanceSetting({
  autoAdvance,
  onChange,
  songLimit,
  onChangeSongLimit,
}: {
  autoAdvance: AutoAdvance;
  onChange: (patch: Partial<AutoAdvance>) => void;
  songLimit: number | null;
  onChangeSongLimit: (seconds: number | null) => void;
}): React.ReactElement {
  const { t } = useT();
  const { enabled, gapSeconds } = autoAdvance;

  return (
    <div className={styles.spGroup}>
      <div className={styles.spLabel}>{t("host.settings.playback")}</div>
      <button
        className={styles.spToggleRow}
        onClick={() => onChange({ enabled: !enabled })}
        aria-pressed={enabled}
      >
        <div>
          <div className={styles.spBtnTitle}>{t("host.settings.autoAdvance")}</div>
          <div className={styles.spBtnDesc}>
            {enabled
              ? t("host.settings.autoAdvanceOn")
              : t("host.settings.autoAdvanceOff")}
          </div>
        </div>
        <div className={`${styles.toggle} ${enabled ? styles.toggleOn : ""}`}>
          <div className={styles.toggleThumb} />
        </div>
      </button>

      {enabled && (
        <div className={styles.spSub}>
          <div className={styles.spSubRow}>
            <div className={styles.spSubLabel}>{t("host.settings.autoGap")}</div>
            <div className={styles.spChips} role="group" aria-label={t("host.settings.autoGap")}>
              {AUTO_ADVANCE_GAPS.map((gap) => (
                <button
                  key={gap}
                  className={`${styles.spChip} ${gap === gapSeconds ? styles.spChipOn : ""}`}
                  onClick={() => onChange({ gapSeconds: gap })}
                  aria-pressed={gap === gapSeconds}
                >
                  {t("host.settings.seconds", { n: gap })}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={styles.spSub}>
        <div className={styles.spBtnTitle}>{t("host.settings.songLimit")}</div>
        <div className={styles.spBtnDesc}>
          {songLimit === null
            ? t("host.settings.songLimitNone")
            : t("host.settings.songLimitHint", { n: songLimit / 60 })}
        </div>
        <div className={styles.spChips} role="group" aria-label={t("host.settings.songLimit")}>
          <button
            className={`${styles.spChip} ${songLimit === null ? styles.spChipOn : ""}`}
            onClick={() => onChangeSongLimit(null)}
            aria-pressed={songLimit === null}
          >
            {t("host.settings.songLimitOff")}
          </button>
          {SONG_LIMIT_OPTIONS.map((limit) => (
            <button
              key={limit}
              className={`${styles.spChip} ${limit === songLimit ? styles.spChipOn : ""}`}
              onClick={() => onChangeSongLimit(limit)}
              aria-pressed={limit === songLimit}
            >
              {t("host.settings.minutes", { n: limit / 60 })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
