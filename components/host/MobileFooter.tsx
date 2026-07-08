import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { renderWithHeart } from "../../lib/i18n/renderWithHeart";

// Mobile page footer: on phones the transport footer hides (it would land
// mid-page, above the stacked queue), so this pins the attribution to the
// bottom of the screen. Hidden on desktop.
export function MobileFooter() {
  const { t } = useT();
  return (
    <footer className={styles.mobileFooter}>
      <span className={styles.transportLogo}>KaraoQ</span>
      <a
        href="https://variationsonastring.com"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.transportLink}
      >
        {renderWithHeart(t('footer.credit'), styles.transportHeart)}
      </a>
    </footer>
  );
}
