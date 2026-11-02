import * as React from "react";
import styles from "../../styles/ScreenHelp.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

export function ScreenHelpLink({ onClick }: { onClick: () => void }): React.ReactElement {
  const { t } = useT();
  return (
    <button type="button" className={styles.screenHelpLink} onClick={onClick}>
      {t("screenHelp.link")}
    </button>
  );
}
