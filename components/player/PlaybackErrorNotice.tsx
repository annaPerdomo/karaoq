import * as React from "react";
import styles from "../../styles/PlaybackError.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

// Passive by design: clicks fall through to the transport bar sharing this box,
// which is how the room moves past the dead video.
export function PlaybackErrorNotice({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <div className={`${styles.notice} ${className ?? ""}`} role="status">
      {t('player.unplayable')}
    </div>
  );
}
