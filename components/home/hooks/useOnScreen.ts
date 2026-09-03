import * as React from "react";

// True whenever the element is on screen, and false again once it leaves —
// unlike useInView (one-shot) this keeps tracking, so an animation that runs
// forever can be parked while the element is scrolled away.
//
// `initial` seeds SSR and first paint; `unobservable` is where the hook stays
// for good with no IntersectionObserver (old TV browsers, jsdom). A caller
// that *hides* on-screen must pass false there, or it hides all session.
export default function useOnScreen<T extends Element>(
  initial = true,
  unobservable = initial,
): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [onScreen, setOnScreen] = React.useState(initial);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOnScreen(unobservable);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, [unobservable]);

  return [ref, onScreen];
}
