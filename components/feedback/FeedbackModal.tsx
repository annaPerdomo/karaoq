import * as React from "react";

import styles from "../../styles/Feedback.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import { MAX_FEEDBACK_CONTACT_LENGTH, MAX_FEEDBACK_LENGTH } from "../../lib/limits";
import { FEEDBACK_KINDS, type FeedbackKind } from "../../pages/api/types";
import postFeedback from "./postFeedback";

/** Show the remaining-characters hint only once someone is near the cap —
 * a counter on an empty box reads as a word limit to hit. */
const COUNTER_VISIBLE_FROM = MAX_FEEDBACK_LENGTH - 200;

export function FeedbackModal({
  onClose,
  roomId,
  role,
}: {
  onClose: () => void;
  roomId?: string;
  role?: "host" | "singer";
}) {
  const { t } = useT();
  const [kind, setKind] = React.useState<FeedbackKind>("idea");
  const [message, setMessage] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  // Where the press that produced a click started: a drag selecting textarea
  // text and releasing outside the panel still fires its click on the overlay,
  // which would otherwise read as "dismiss" and bin the draft.
  const pressTargetRef = React.useRef<EventTarget | null>(null);

  /** Anything typed is unrecoverable once this closes. */
  const requestClose = React.useCallback(() => {
    if (!sent && message.trim() && !window.confirm(t("feedback.discard"))) {
      return;
    }
    onClose();
  }, [sent, message, onClose, t]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setFailed(false);
    const ok = await postFeedback({
      kind,
      message: trimmed,
      contact: contact.trim(),
      roomId,
      role,
    });
    setSending(false);
    if (ok) setSent(true);
    else setFailed(true);
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        pressTargetRef.current = e.target;
      }}
      onClick={(e) => {
        if (pressTargetRef.current === e.currentTarget) requestClose();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("feedback.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={styles.close}
          onClick={requestClose}
          title={t("common.close")}
          aria-label={t("common.close")}
        >
          &times;
        </button>

        {sent ? (
          <div className={styles.sent}>
            <div className={styles.sentIcon}>🎤</div>
            <div className={styles.sentTitle}>{t("feedback.sentTitle")}</div>
            <p className={styles.sentBody}>{t("feedback.sentBody")}</p>
            <button className={styles.submit} onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        ) : (
          <>
            <h3 className={styles.title}>{t("feedback.title")}</h3>
            <p className={styles.lede}>{t("feedback.lede")}</p>

            <div className={styles.kinds} role="group" aria-label={t("feedback.kindLabel")}>
              {FEEDBACK_KINDS.map((k) => (
                <button
                  key={k}
                  className={`${styles.kind} ${kind === k ? styles.kindActive : ""}`}
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                >
                  {t(`feedback.kind.${k}`)}
                </button>
              ))}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="feedback-message">
                {t(`feedback.prompt.${kind}`)}
              </label>
              <textarea
                id="feedback-message"
                ref={textareaRef}
                className={styles.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t(`feedback.placeholder.${kind}`)}
                maxLength={MAX_FEEDBACK_LENGTH}
              />
              {message.length >= COUNTER_VISIBLE_FROM && (
                <span className={styles.counter}>
                  {MAX_FEEDBACK_LENGTH - message.length}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="feedback-contact">
                {t("feedback.contactLabel")}
              </label>
              <input
                id="feedback-contact"
                className={styles.input}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t("feedback.contactPlaceholder")}
                maxLength={MAX_FEEDBACK_CONTACT_LENGTH}
              />
              <span className={styles.hint}>{t("feedback.contactHint")}</span>
            </div>

            {failed && <p className={styles.error}>{t("feedback.error")}</p>}

            <button
              className={styles.submit}
              onClick={handleSubmit}
              disabled={!message.trim() || sending}
            >
              {sending ? t("feedback.sending") : t("feedback.send")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default FeedbackModal;
