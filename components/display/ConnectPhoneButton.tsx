import * as React from "react";
import styles from "../../styles/Display.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { getRoomKey } from "../../lib/roomKeyStore";
import { Icons } from "../host/icons";

export function ConnectPhoneButton({
  joinCode,
  onPress,
}: {
  joinCode: string | undefined;
  onPress: () => void;
}) {
  const { t } = useT();
  const [isHost, setIsHost] = React.useState(false);

  React.useEffect(() => {
    setIsHost(!!joinCode && getRoomKey(joinCode)?.role === "host");
  }, [joinCode]);

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
