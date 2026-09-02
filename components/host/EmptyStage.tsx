import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "./icons";

// The join code and its QR belong to the sidebar's Scan to join shelf; a copy
// here read as a second, competing set of controls rather than as help.
export function EmptyStage({
  /** "first" = nothing sung yet, "more" = the queue drained mid-night. */
  variant,
  remote,
  onAddSong,
}: {
  variant: "first" | "more";
  remote: boolean;
  onAddSong: () => void;
}) {
  const { t } = useT();
  const first = variant === "first";
  return (
    <div className={styles.emptyState}>
      <div className={styles.stageSpot} aria-hidden="true">
        <div className={styles.stageFloor}>
          <div className={`${styles.stageSplash} ${styles.stageSplashLeft}`} />
          <div className={`${styles.stageSplash} ${styles.stageSplashRight}`} />
        </div>

        <div className={`${styles.stageBeam} ${styles.stageBeamKey}`} />
        <div className={`${styles.stageBeam} ${styles.stageBeamLeft}`} />
        <div className={`${styles.stageBeam} ${styles.stageBeamRight}`} />

        <div className={styles.stagePool} />
        <img
          className={styles.stageMicReflection}
          src="/stage-mic.webp"
          alt=""
          width={275}
          height={860}
        />
        <img
          className={styles.stageMic}
          src="/stage-mic.webp"
          alt=""
          width={275}
          height={860}
        />
      </div>

      <div className={styles.emptyStage}>
        <h2 className={styles.emptyTitle}>{t("host.empty.title")}</h2>
        {/* A co-host adds songs from their own panel, so they get a lede that
            says where to go instead of a button. */}
        {remote ? (
          <p className={styles.emptyStageLede}>
            {t(first ? "host.cohost.emptyQueue" : "host.open.cohostAdd")}
          </p>
        ) : (
          <>
            <p className={styles.emptyStageLede}>
              {t(first ? "host.empty.lede" : "host.open.lede")}
            </p>
            {/* Load-bearing wrapper: it takes the reveal stagger so the
                button's own pulse isn't fighting it for one animation slot. */}
            <div>
              <button className={styles.emptyAddBtn} onClick={onAddSong}>
                {Icons.plus}{" "}
                {t(first ? "host.empty.addFirst" : "host.open.addAnother")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
