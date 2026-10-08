import * as React from "react";
import { useRouter } from "next/router";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { isTvDevice } from "../../lib/calmMotion";
import { PlayMode } from "../../pages/api/types";
import { tvScreenDismissedStorageKey } from "./storage";
import { shouldOfferTvScreen } from "./tvScreenBanner";

export function UseTvAsScreenBanner({
  remote,
  playMode,
  joinCode,
  onUseAsScreen,
}: {
  remote: boolean;
  playMode: PlayMode | null;
  joinCode: string | undefined;
  onUseAsScreen: () => Promise<boolean>;
}) {
  const { t } = useT();
  const router = useRouter();
  const [isTv, setIsTv] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    setIsTv(isTvDevice());
  }, []);

  React.useEffect(() => {
    if (!joinCode) return;
    try {
      setDismissed(localStorage.getItem(tvScreenDismissedStorageKey(joinCode)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [joinCode]);

  if (!joinCode || !shouldOfferTvScreen({ isTv, remote, access: "allowed", playMode, dismissed })) {
    return null;
  }

  function keep() {
    try {
      localStorage.setItem(tvScreenDismissedStorageKey(joinCode!), "1");
    } catch {}
    setDismissed(true);
  }

  async function use() {
    const ok = await onUseAsScreen();
    if (ok) router.push(`/display/${joinCode}`);
  }

  return (
    <div className={styles.tvScreenBanner}>
      <div className={styles.tvScreenText}>
        <strong className={styles.tvScreenTitle}>{t("host.tvScreen.title")}</strong>
        <p className={styles.tvScreenBody}>{t("host.tvScreen.body")}</p>
      </div>
      <div className={styles.tvScreenActions}>
        <button className={styles.tvScreenUse} onClick={use} autoFocus>
          {t("host.tvScreen.use")}
        </button>
        <button className={styles.tvScreenKeep} onClick={keep}>
          {t("host.tvScreen.keep")}
        </button>
      </div>
    </div>
  );
}
