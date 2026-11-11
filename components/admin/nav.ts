import type * as React from 'react';
import type { AdminView } from './types';
import {
  FeaturesIcon,
  FeedbackIcon,
  HealthIcon,
  PulseIcon,
  QuotaIcon,
  RoomsIcon,
  ScreensIcon,
  SuggestionsIcon,
} from './icons';

export interface NavEntry {
  view: AdminView;
  label: string;
  hint: string;
  icon: React.ComponentType;
}

export const PRIMARY_NAV: NavEntry[] = [
  { view: 'rooms', label: 'Rooms', hint: '', icon: RoomsIcon },
  { view: 'features', label: 'Features', hint: '', icon: FeaturesIcon },
  { view: 'health', label: 'Health', hint: '', icon: HealthIcon },
  { view: 'feedback', label: 'Feedback', hint: '', icon: FeedbackIcon },
];

export const SECONDARY_NAV: NavEntry[] = [
  { view: 'quota', label: 'Quota', hint: 'YouTube searches: today, by room, the cache, the ledger', icon: QuotaIcon },
  { view: 'suggestions', label: 'Suggestions', hint: 'Song ideas, wanted songs, the corpus', icon: SuggestionsIcon },
  { view: 'pulse', label: 'Pulse', hint: 'Growth, activation, audience', icon: PulseIcon },
  { view: 'screens', label: 'Screens', hint: 'Music video, swaps and branding in detail', icon: ScreensIcon },
];

export function isSecondary(view: AdminView): boolean {
  return SECONDARY_NAV.some((entry) => entry.view === view);
}
