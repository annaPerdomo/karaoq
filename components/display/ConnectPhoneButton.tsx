import * as React from "react";
import styles from "../../styles/Display.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { Icons } from "../host/icons";

export function ConnectPhoneButton({
  isHost,
  onPress,
}: {
  isHost: boolean;
  onPress: () => void;
}) {
  const { t } = useT();

  if (!isHost) return null;

  return (
    <button
      className={styles.connectPhoneBtn}
      onClick={onPress}
      data-remote="connect-phone"
      title={t("display.connectPhone")}
    >
      {Icons.users}
      <span>{t("display.connectPhone")}</span>
    </button>
  );
}
