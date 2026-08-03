import * as React from "react";

import styles from "../../styles/Feedback.module.css";
import { useT } from "../../lib/i18n/I18nProvider";
import FeedbackModal from "./FeedbackModal";

/** Button + modal in one, so a surface adds feedback in a line and owns none of
 * the state. `className` dresses the trigger in the host screen's own module;
 * omit it for the plain text-link look defined here. */
export function FeedbackTrigger({
  className,
  children,
  roomId,
  role,
}: {
  className?: string;
  children?: React.ReactNode;
  roomId?: string;
  role?: "host" | "singer";
}) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        className={className ?? styles.trigger}
        onClick={() => setOpen(true)}
      >
        {children ?? t("feedback.trigger")}
      </button>
      {open && (
        <FeedbackModal
          onClose={() => setOpen(false)}
          roomId={roomId}
          role={role}
        />
      )}
    </>
  );
}

export default FeedbackTrigger;
