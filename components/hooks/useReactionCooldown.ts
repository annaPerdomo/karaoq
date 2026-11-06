import * as React from 'react';
import { REACTION_COOLDOWN_MS } from '../../app/queue/cheerConstants';

export function useReactionCooldown() {
  const [cooldown, setCooldown] = React.useState(false);
  // The ref, not the state, gates sends: two taps inside one render would both see cooldown=false.
  const active = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const tryStart = React.useCallback(() => {
    if (active.current) return false;
    active.current = true;
    setCooldown(true);
    timer.current = setTimeout(() => {
      active.current = false;
      setCooldown(false);
    }, REACTION_COOLDOWN_MS);
    return true;
  }, []);

  return { cooldown, tryStart };
}
