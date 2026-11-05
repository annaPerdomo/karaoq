import * as React from 'react';
import type { NextRouter } from 'next/router';
import { JoinVia, asJoinVia } from '../../../app/queue/trackSession';

// Stripped after capture so a forwarded link doesn't claim the same route. A ref is enough:
// tracking can't start before the router is ready, since joinCode is undefined until then.
export function useJoinVia(router: NextRouter): React.MutableRefObject<JoinVia | undefined> {
  const viaRef = React.useRef<JoinVia | undefined>(undefined);
  React.useEffect(() => {
    if (!router.isReady) return;
    const via = asJoinVia(router.query.via);
    if (!via) return;
    viaRef.current = via;
    const { via: _dropped, ...query } = router.query;
    void _dropped;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  return viaRef;
}
