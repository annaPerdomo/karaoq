import * as React from "react";

// True once the element has scrolled into view; stays true after (one-shot —
// it's only ever used to trigger an entrance animation). Fires immediately
// when IntersectionObserver isn't available (e.g. in tests).
export default function useInView<T extends Element>(
  threshold: number
): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, inView];
}
