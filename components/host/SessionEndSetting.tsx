import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import {
  clockTimeToEpoch,
  epochToClockInput,
  formatClockTime,
} from "../../lib/queueTime";

/** When the room has to be out. Unlike its neighbours in the gear menu this is
 * shared with every phone in the room, not a host-local pref. */
export function SessionEndSetting({
  sessionEndsAt,
  onChange,
}: {
  sessionEndsAt: number | null;
  onChange: (endsAt: number | null) => void;
}): React.ReactElement {
  const { t, locale } = useT();
  const [value, setValue] = React.useState(
    sessionEndsAt === null ? "" : epochToClockInput(sessionEndsAt)
  );

  // Follow the room: another host device (or a co-host) may have set it.
  React.useEffect(() => {
    setValue(sessionEndsAt === null ? "" : epochToClockInput(sessionEndsAt));
  }, [sessionEndsAt]);

  function apply() {
    const epoch = clockTimeToEpoch(value);
    if (epoch === null) return;
    onChange(epoch);
  }

  return (
    <div className={styles.spGroup}>
      <div className={styles.spLabel}>{t("host.settings.session")}</div>
      <div className={styles.spBtnTitle}>{t("host.settings.endTime")}</div>
      <div className={styles.spBtnDesc}>
        {sessionEndsAt === null
          ? t("host.settings.endTimeNone")
          : t("host.settings.endTimeSet", {
              time: formatClockTime(sessionEndsAt, locale),
            })}
      </div>
      <div className={styles.spTimeRow}>
        <input
          className={styles.spTimeInput}
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          aria-label={t("host.settings.endTime")}
        />
        <button
          className={styles.spTimeBtn}
          onClick={apply}
          disabled={clockTimeToEpoch(value) === null}
        >
          {t("host.settings.endTimeSave")}
        </button>
        {sessionEndsAt !== null && (
          <button
            className={styles.spTimeClear}
            onClick={() => {
              setValue("");
              onChange(null);
            }}
          >
            {t("host.settings.endTimeClear")}
          </button>
        )}
      </div>
      <div className={styles.spBtnDesc}>{t("host.settings.endTimeHint")}</div>
    </div>
  );
}
