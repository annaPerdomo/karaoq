import * as React from "react";

// True whenever the element is on screen, and false again once it leaves —
// unlike useInView (one-shot) this keeps tracking, so an animation that runs
// forever can be parked while the element is scrolled away. Starts true, which
// both keeps the server and first client render in agreement and leaves the
// animation running where IntersectionObserver is missing (e.g. in tests).
export default function useOnScreen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [onScreen, setOnScreen] = React.useState(true);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, onScreen];
}
