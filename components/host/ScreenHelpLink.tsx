import * as React from "react";
import styles from "../../styles/ScreenHelp.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

/** `checking`: a display is open but nobody has confirmed it's on the big screen yet. */
export function ScreenHelpLink({ onClick, checking = false }: { onClick: () => void; checking?: boolean }): React.ReactElement {
  const { t } = useT();
  return (
    <button type="button" className={styles.screenHelpLink} onClick={onClick}>
      {t(checking ? "screenHelp.linkCheck" : "screenHelp.link")}
    </button>
  );
}
