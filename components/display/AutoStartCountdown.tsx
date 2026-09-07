import * as React from 'react';
import { CountdownRing } from '../player/CountdownRing';

export default function AutoStartCountdown({
  secondsLeft,
  totalSeconds,
  onStartNow,
}: {
  secondsLeft: number;
  totalSeconds: number;
  onStartNow: () => void;
}): React.ReactElement {
  return (
    <CountdownRing
      secondsLeft={secondsLeft}
      totalSeconds={totalSeconds}
      onStartNow={onStartNow}
      size={160}
    />
  );
}
