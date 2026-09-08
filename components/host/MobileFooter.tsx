import Link from "next/link";

import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { renderWithHeart } from "../../lib/i18n/renderWithHeart";
import FeedbackTrigger from "../feedback/FeedbackTrigger";

// Mobile page footer: on phones the transport footer hides (it would land
// mid-page, above the stacked queue), so this pins the attribution to the
// bottom of the screen. Hidden on desktop unless `standalone` (no transport bar).
export function MobileFooter({
  roomId,
  standalone = false,
}: {
  roomId?: string;
  standalone?: boolean;
}) {
  const { t } = useT();
  return (
    <footer
      className={`${styles.mobileFooter} ${standalone ? styles.mobileFooterStandalone : ""}`}
    >
      <div className={styles.transportFooterStart}>
        <span className={styles.transportLogo}>KaraoQ</span>
        <Link href="/privacy" className={styles.transportLegalLink}>
          {t('footer.privacy')}
        </Link>
        <span className={styles.transportLegalSep} aria-hidden="true">·</span>
        <Link href="/terms" className={styles.transportLegalLink}>
          {t('footer.terms')}
        </Link>
      </div>
      <a
        href="https://variationsonastring.com"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.transportLink}
      >
        {renderWithHeart(t('footer.credit'), styles.transportHeart)}
      </a>
      <FeedbackTrigger
        className={styles.transportFeedback}
        role="host"
        roomId={roomId}
      />
    </footer>
  );
}
