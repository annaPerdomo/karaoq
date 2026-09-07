import * as React from "react";
import styles from "../../styles/Countdown.module.css";
import {
  BURST_SECONDS,
  DEFAULT_ACCENTS,
  drawPieces,
  paletteFrom,
  spawnBurst,
  stepPieces,
} from "../../lib/confetti";

/** Smart TVs never report the preference, so the document flag stands in. */
function calmMotion(): boolean {
  if (typeof window === "undefined") return true;
  if (document.documentElement.hasAttribute("data-tv")) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

/** One canvas rather than hundreds of animated elements: a single compositor
 * layer. The calm blocks in the stylesheet hide it; the effect skips the work too. */
export function StageScene({ celebrate }: { celebrate: boolean }): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!celebrate || !canvas || calmMotion()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Capped: a 3x phone would fill nine times the pixels for paper nobody sees the edges of.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const stage = { width: 0, height: 0 };
    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      stage.width = width;
      stage.height = height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    if (stage.width === 0 || stage.height === 0) return;

    // The host shell's theme sets --acc-a/--acc-b (styles/Host.module.css).
    const theme = getComputedStyle(canvas);
    const accA = theme.getPropertyValue("--acc-a") || DEFAULT_ACCENTS[0];
    const accB = theme.getPropertyValue("--acc-b") || DEFAULT_ACCENTS[1];
    const pieces = spawnBurst(stage, Math.random, paletteFrom(accA, accB));
    const start = performance.now();
    let last = start;
    let frame = 0;
    const tick = (now: number) => {
      // A tab coming back from hidden brings a huge gap; uncapped, pieces teleport through the floor.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      const alive = stepPieces(pieces, dt, t, stage);
      ctx.clearRect(0, 0, stage.width, stage.height);
      drawPieces(ctx, pieces, t);
      if (alive > 0 && t < BURST_SECONDS + 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
      ctx.clearRect(0, 0, stage.width, stage.height);
    };
  }, [celebrate]);

  return (
    <div className={styles.scene} aria-hidden="true">
      {celebrate && <canvas ref={canvasRef} className={styles.confetti} />}
    </div>
  );
}
