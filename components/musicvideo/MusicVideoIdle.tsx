import * as React from "react";
import styles from "../../styles/MusicVideo.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import formatSongTitle from "../../lib/songTitle";
import QrJoinCard from "../QrJoinCard";
import ClubLogo from "../brand/ClubLogo";

export default function MusicVideoIdle({
  joinUrl,
  joinCode,
  origin,
  logo,
  songTitle,
  reason,
}: {
  joinUrl: string;
  joinCode: string;
  origin: string;
  logo?: string;
  songTitle?: string;
  reason: "waiting" | "unavailable";
}) {
  const { t } = useT();
  return (
    <div className={styles.idle}>
      <ClubLogo roomId={joinCode} logo={logo} className={styles.idleLogo} />
      <QrJoinCard joinUrl={joinUrl} joinCode={joinCode} origin={origin} />
      {songTitle && <p className={styles.idleSong}>{formatSongTitle(songTitle)}</p>}
      <p className={styles.idleText}>
        {reason === "waiting" ? t("musicVideo.waiting") : t("musicVideo.unavailable")}
      </p>
    </div>
  );
}
