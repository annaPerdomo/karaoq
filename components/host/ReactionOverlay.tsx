import * as React from "react";
import styles from "../../styles/Host.module.css";
import { Reaction } from "../../pages/api/types";
import { isTextReaction } from "./utils";

// Reaction overlay — inside the player area so cheers float over the current
// song, never the queue or panels.
export function ReactionOverlay({
  reactions,
}: {
  reactions: (Reaction & { key: string; left: number; sway: number })[];
}) {
  return (
    <div className={styles.reactionOverlay}>
      {reactions.map((r) => (
        <div
          key={r.key}
          className={styles.reactionBubble}
          style={{ left: `${r.left}%`, '--sway': `${r.sway}px` } as React.CSSProperties}
        >
          {isTextReaction(r.emoji) ? (
            <span className={styles.reactionText}>{r.emoji}</span>
          ) : (
            <span className={styles.reactionEmoji}>{r.emoji}</span>
          )}
        </div>
      ))}
    </div>
  );
}
