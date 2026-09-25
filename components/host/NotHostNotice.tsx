import { useRouter } from "next/router";
import styles from "../../styles/Host.module.css";
import { useT } from "../../lib/i18n/I18nProvider";

export function NotHostNotice({
  joinCode,
  remote,
}: {
  joinCode: string;
  remote: boolean;
}) {
  const router = useRouter();
  const { t } = useT();
  return (
    <main className={styles.main}>
      <div className={styles.errorCard}>
        <h2>{t("host.locked.title")}</h2>
        <p>{t(remote ? "host.locked.remoteBody" : "host.locked.body")}</p>
        <button
          className={styles.btn}
          onClick={() => router.push(`/sing/${joinCode}`)}
        >
          {t("host.locked.join")}
        </button>
      </div>
    </main>
  );
}
