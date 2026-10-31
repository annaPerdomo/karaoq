import * as React from "react";
import styles from "../../styles/MusicVideo.module.css";
import ClubLogo from "../brand/ClubLogo";

export default function MusicVideoLockup({
  joinCode,
  logo,
}: {
  joinCode: string;
  logo: string | undefined;
}) {
  return (
    <>
      <ClubLogo roomId={joinCode} logo={logo} className={styles.clubLogo} />
      <div className={styles.karaoqBadge}>
        <span className={styles.wordmark}>KaraoQ</span>
      </div>
    </>
  );
}
