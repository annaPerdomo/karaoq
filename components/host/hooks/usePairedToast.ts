import * as React from "react";
import { useRouter } from "next/router";

export function usePairedToast(opts: {
  remote: boolean;
  joinCode: string | undefined;
  message: string;
  showToast: (msg: string) => void;
}) {
  const { remote, joinCode, message, showToast } = opts;
  const router = useRouter();

  React.useEffect(() => {
    if (!remote && router.query.paired === "1" && joinCode) {
      showToast(message);
      const { paired: _paired, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.paired, joinCode]);
}
