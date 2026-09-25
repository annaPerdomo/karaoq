import * as React from "react";
import { useRouter } from "next/router";
import styles from "../../styles/Host.module.css";
import { normalizeRoomId } from "../../lib/roomCode";
import { useT } from "../../lib/i18n/I18nProvider";
import { useHostGate } from "./hooks/useHostGate";
import { useCohostKeyFromFragment } from "./hooks/useCohostKeyFromFragment";
import { NotHostNotice } from "./NotHostNotice";

/** `body` claims the room (play token, session tracking) the instant it
 * mounts, so a locked device must be kept out of the tree, not just covered. */
export function HostGate({
  remote,
  body,
}: {
  remote: boolean;
  body: React.ReactElement;
}): React.ReactElement {
  const router = useRouter();
  const { t } = useT();
  const joinCode = normalizeRoomId(router.query.joinCode) as string | undefined;
  useCohostKeyFromFragment(remote, joinCode);
  const access = useHostGate(joinCode, remote);

  if (!joinCode || access === "checking") return <div className={styles.loading}>{t('host.loading')}</div>;
  if (access === "locked") return <NotHostNotice joinCode={joinCode} remote={remote} />;
  return body;
}
