import * as React from 'react';
import { v4 as uuidv4 } from 'uuid';
import postReaction from '../../../app/queue/postReaction';
import { getClientId } from '../../../app/queue/trackSession';
import { Reaction } from '../../../pages/api/types';
import { CheerSource } from '../../../app/queue/cheerConstants';
import { useReactionCooldown } from '../../hooks/useReactionCooldown';

const HAS_CHEERED_KEY = 'karaoq_has_cheered';

export type VisibleReaction = Reaction & { key: string; left: number; sway: number };

export function useCheers(joinCode: string | undefined, username: string) {
  const [hasCheered, setHasCheered] = React.useState(true);
  const [lastSentEmoji, setLastSentEmoji] = React.useState<string | null>(null);
  const { cooldown, tryStart: tryStartCooldown } = useReactionCooldown();
  const [visibleReactions, setVisibleReactions] = React.useState<VisibleReaction[]>([]);
  const seenReactionIds = React.useRef(new Set<string>());
  const reactionTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const sentEmojiTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Starts true: the glow must not flash before storage is read.
  React.useEffect(() => {
    try {
      setHasCheered(!!localStorage.getItem(HAS_CHEERED_KEY));
    } catch {
      /* private mode: no nudge rather than one that never goes away */
    }
  }, []);

  React.useEffect(() => {
    const timers = reactionTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      if (sentEmojiTimer.current) clearTimeout(sentEmojiTimer.current);
    };
  }, []);

  const spawnReactionPops = React.useCallback((fresh: Reaction[]) => {
    const withKeys = fresh.map((r) => ({
      ...r,
      key: r.id,
      left: 5 + Math.random() * 60,
      sway: Math.random() * 60 - 30,
    }));
    setVisibleReactions((prev) => [...prev, ...withKeys]);
    const timer = setTimeout(() => {
      const ids = new Set(fresh.map((r) => r.id));
      setVisibleReactions((prev) => prev.filter((r) => !ids.has(r.key)));
    }, 4200);
    reactionTimers.current.push(timer);
  }, []);

  // animate=false on initial load only seeds the seen-set — otherwise a join
  // replays the last 30s of cheers at once.
  const processReactions = React.useCallback(
    (reactions: Reaction[] | undefined, animate = true) => {
      if (!reactions || reactions.length === 0) return;
      const fresh = reactions.filter((r) => !seenReactionIds.current.has(r.id));
      if (fresh.length === 0) return;
      fresh.forEach((r) => seenReactionIds.current.add(r.id));
      if (seenReactionIds.current.size > 200) {
        const entries = Array.from(seenReactionIds.current);
        seenReactionIds.current = new Set(entries.slice(-100));
      }
      if (animate) spawnReactionPops(fresh);
    },
    [spawnReactionPops]
  );

  async function sendReaction(emoji: string, source: CheerSource = 'bar') {
    if (!joinCode || !tryStartCooldown()) return;
    const name = username.trim();
    if (!hasCheered) {
      setHasCheered(true);
      try {
        localStorage.setItem(HAS_CHEERED_KEY, '1');
      } catch {
        /* private mode */
      }
    }
    setLastSentEmoji(emoji);
    // One timer across rapid taps, so an earlier tap's can't clear a later "Sent!".
    if (sentEmojiTimer.current) clearTimeout(sentEmojiTimer.current);
    sentEmojiTimer.current = setTimeout(() => setLastSentEmoji(null), 1500);
    const id = uuidv4();
    // Pop the cheer locally now; the seen-set keeps the next poll from replaying it.
    seenReactionIds.current.add(id);
    spawnReactionPops([{ id, emoji, userName: name, timestamp: Date.now() }]);
    const ok = await postReaction(joinCode, id, emoji, name, getClientId(), source);
    if (!ok) setLastSentEmoji(null);
  }

  return {
    cheerNudge: !hasCheered,
    cooldown,
    lastSentEmoji,
    visibleReactions,
    processReactions,
    sendReaction,
  };
}
