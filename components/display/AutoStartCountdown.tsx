import * as React from 'react';
import { CountIn } from '../player/CountIn';

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
    <CountIn
      secondsLeft={secondsLeft}
      totalSeconds={totalSeconds}
      onStartNow={onStartNow}
      size={24}
    />
  );
}
