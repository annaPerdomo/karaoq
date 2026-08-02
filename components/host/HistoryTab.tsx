import * as React from "react";
import styles from "../../styles/Host.module.css";
import { QueueEntry } from "../../pages/api/types";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";
import { formatSongTitle } from "./utils";

/** What's already been sung, newest first, each restorable to the queue. */
export function HistoryTab({
  historyItems,
  onReplayFromHistory,
}: {
  historyItems: QueueEntry[];
  onReplayFromHistory: (id: string) => void;
}) {
  const { t } = useT();

  return (
    <div className={styles.historyList}>
      {historyItems.length > 0 ? (
        [...historyItems].reverse().map((item, i) => (
          <div key={item.id} className={styles.historyItem}>
            <span className={styles.historyNum}>{historyItems.length - i}</span>
            <div className={styles.queueInfo}>
              <div className={styles.queueArtist} title={item.userName}>
                {item.userName}
              </div>
              <div
                className={styles.queueSong}
                title={formatSongTitle(item.songTitle)}
              >
                {formatSongTitle(item.songTitle)}
              </div>
            </div>
            <button
              className={styles.replayBtn}
              onClick={() => onReplayFromHistory(item.id)}
              title={t("host.history.restoreTitle")}
              aria-label={t("host.history.restoreTitle")}
            >
              {Icons.replay}
              <span className={styles.replayBtnLabel}>
                {t("host.history.restore")}
              </span>
            </button>
          </div>
        ))
      ) : (
        <p className={styles.emptyQueue}>{t("host.history.empty")}</p>
      )}
    </div>
  );
}
