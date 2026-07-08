import * as React from "react";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

export function WelcomePrompt({
  joinCode,
  welcomeName,
  onChangeName,
  onSubmit,
}: {
  joinCode: string | undefined;
  welcomeName: string;
  onChangeName: (name: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useT();
  return (
    <div className={styles.welcomeOverlay}>
      <div className={styles.welcomeCard}>
        <div className={styles.welcomeLogo}>KaraoQ</div>
        <p className={styles.welcomeRoom}>
          {t('sing.welcome.room').split(/(\{code\})/).map((part, i) =>
            part === '{code}'
              ? <strong key={i}>{joinCode?.toUpperCase()}</strong>
              : <React.Fragment key={i}>{part}</React.Fragment>
          )}
        </p>
        <h2 className={styles.welcomePrompt}>{t('sing.welcome.prompt')}</h2>
        <input
          className={styles.welcomeInput}
          placeholder={t('common.enterYourName')}
          value={welcomeName}
          onChange={(e) => onChangeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          autoFocus
          maxLength={30}
        />
        <button
          className={styles.welcomeBtn}
          onClick={onSubmit}
          disabled={!welcomeName.trim()}
        >
          {t('sing.welcome.go')}
        </button>
      </div>
    </div>
  );
}
