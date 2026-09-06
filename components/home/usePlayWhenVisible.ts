import * as React from 'react';

/**
 * Play the film while it's on screen, pause when it isn't — a looping film
 * off-screen in a scrolling page keeps a decoder busy for nobody. `delayMs`
 * holds the first play back for a stage whose CSS reveal runs before it, and
 * scrolling away cancels a pending reveal. No IntersectionObserver: plays anyway.
 */
export default function usePlayWhenVisible(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  src: string | null,
  delayMs = 0
): void {
  React.useEffect(() => {
    const video = videoRef.current;
    if (!src || !video) return;

    let timer = 0;
    let revealed = false;
    // Muted, so autoplay policy allows this; refused anyway, the poster stays.
    const play = () => void video.play().catch(() => {});
    const enter = () => {
      if (revealed) return play();
      if (timer) return;
      timer = window.setTimeout(() => {
        revealed = true;
        timer = 0;
        play();
      }, delayMs);
    };
    const leave = () => {
      window.clearTimeout(timer);
      timer = 0;
      video.pause();
    };

    if (typeof IntersectionObserver === 'undefined') {
      enter();
      return () => window.clearTimeout(timer);
    }

    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? enter() : leave()),
      { threshold: 0.25 }
    );
    io.observe(video);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [src, videoRef, delayMs]);
}
