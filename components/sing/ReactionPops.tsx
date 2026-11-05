import * as React from 'react';
import styles from '../../styles/Sing.module.css';
import { isTextReaction } from '../../app/queue/cheerConstants';
import { VisibleReaction } from './hooks/useCheers';

const ReactionPops = ({ reactions }: { reactions: VisibleReaction[] }): React.ReactElement => (
  <div className={styles.reactionOverlay} aria-hidden="true">
    {reactions.map((r) => (
      <div
        key={r.key}
        className={styles.reactionBubble}
        style={{ left: `${r.left}%`, '--sway': `${r.sway}px` } as React.CSSProperties}
      >
        {isTextReaction(r.emoji) ? (
          <span className={styles.reactionTextPop}>{r.emoji}</span>
        ) : (
          <span className={styles.reactionEmojiPop}>{r.emoji}</span>
        )}
      </div>
    ))}
  </div>
);

export default ReactionPops;
