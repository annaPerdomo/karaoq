import * as React from 'react';
import { shouldShowHostFromPhone } from '../../../lib/shouldShowHostFromPhone';

const STARTED_KEY = 'karaoq_tv_host';
const HIDDEN_KEY = 'karaoq_tv_host_hidden';

export function useHostFromPhoneVisible(
  joinCode: string | undefined,
  opts: { editing: boolean; playing: boolean }
): { show: boolean; hide: () => void } {
  const [startedHere, setStartedHere] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    if (!joinCode) return;
    try {
      setStartedHere(sessionStorage.getItem(STARTED_KEY) === joinCode);
      setHidden(sessionStorage.getItem(HIDDEN_KEY) === joinCode);
    } catch {}
  }, [joinCode]);

  const hide = React.useCallback(() => {
    setHidden(true);
    if (!joinCode) return;
    try {
      sessionStorage.setItem(HIDDEN_KEY, joinCode);
    } catch {}
  }, [joinCode]);

  const show = shouldShowHostFromPhone({
    startedHere,
    hidden,
    editing: opts.editing,
    playing: opts.playing,
  });

  return { show, hide };
}
