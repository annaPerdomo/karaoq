import * as React from "react";
import styles from "../../../styles/ScreenHelp.module.css";
import { useT } from "../../../lib/i18n/I18nProvider";
import { StepVisual } from "../../../lib/screenHelpSteps";
import { gearHref, GearId } from "../../../lib/screenHelpGear";
import { StepVisualIcon } from "./StepVisualIcon";

export function LookFor({ visuals }: { visuals?: StepVisual[] }): React.ReactElement | null {
  const { t } = useT();
  if (!visuals?.length) return null;
  return (
    <div className={styles.look}>
      <p className={styles.lookTitle}>{t("screenHelp.look.title")}</p>
      <ul className={styles.lookList}>
        {visuals.map((v) => (
          <li key={v} className={styles.lookItem}>
            <span className={styles.lookIcon}>
              <StepVisualIcon visual={v} keyClassName={styles.key} />
            </span>
            <span className={styles.lookLabel}>{t(`screenHelp.look.${v}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GearLinks({ gear, disclosure = true }: { gear?: GearId[]; disclosure?: boolean }): React.ReactElement | null {
  const { t } = useT();
  if (!gear?.length) return null;
  return (
    <div className={styles.gear}>
      <p className={styles.lookTitle}>{t("screenHelp.gear.title")}</p>
      <div className={styles.gearList}>
        {gear.map((id) => (
          <a key={id} className={styles.gearLink} href={gearHref(id)} target="_blank" rel="sponsored nofollow noopener">
            {t(`screenHelp.gear.${id}`)} <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
      {disclosure && <p className={styles.gearDisclosure}>{t("screenHelp.gear.disclosure")}</p>}
    </div>
  );
}
