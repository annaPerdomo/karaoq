import * as React from "react";
import styles from "../../styles/MusicVideo.module.css";
import QrJoinCard from "../QrJoinCard";
import { nearestQrSize } from "../../pages/api/types";

export default function MusicVideoQrCorner({
  joinUrl,
  joinCode,
  origin,
  qrPx,
}: {
  joinUrl: string;
  joinCode: string;
  origin: string;
  qrPx: number;
}) {
  return (
    <div className={styles.qrCorner}>
      <QrJoinCard joinUrl={joinUrl} joinCode={joinCode} origin={origin} size={nearestQrSize(qrPx)} sizePx={qrPx} />
    </div>
  );
}
