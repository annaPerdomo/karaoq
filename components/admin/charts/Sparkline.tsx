import * as React from 'react';
import { SERIES_1 } from './palette';

/** Decorative beside a visible number, so it carries no interaction. */
export default function Sparkline({
  data,
  color = SERIES_1,
  width = 96,
  height = 28,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}): React.ReactElement | null {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const pad = 4;
  const stepX = (width - pad * 2) / (data.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const points = data.map((v, i) => `${pad + i * stepX},${y(v)}`).join(' ');
  const lastX = pad + (data.length - 1) * stepX;
  const lastY = y(data[data.length - 1]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={lastX} cy={lastY} r={4} fill={color} stroke="#1a1a2e" strokeWidth={2} />
    </svg>
  );
}
