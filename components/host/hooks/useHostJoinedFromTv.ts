import * as React from "react";
import { useRouter } from "next/router";
import postHostJoined from "../../../app/queue/postHostJoined";
import { HOST_FROM_TV_PARAM } from "../../../lib/shouldShowHostFromPhone";

// Strip the tag only after a successful report, so a failed one retries on reload.
export function useHostJoinedFromTv(joinCode: string | undefined, remote: boolean): void {
  const router = useRouter();
  const fromTv = router.query.via === HOST_FROM_TV_PARAM;

  React.useEffect(() => {
    if (!joinCode || remote || !fromTv) return;
    postHostJoined(joinCode).then((ok) => {
      if (!ok) return;
      const { via: _via, ...query } = router.query;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, remote, fromTv]);
}
