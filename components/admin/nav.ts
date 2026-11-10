import type * as React from 'react';
import type { AdminView } from './types';
import {
  FeaturesIcon,
  FeedbackIcon,
  HealthIcon,
  PulseIcon,
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
];

export const SECONDARY_NAV: NavEntry[] = [
  { view: 'suggestions', label: 'Suggestions', hint: 'Song ideas, wanted songs, the corpus', icon: SuggestionsIcon },
  { view: 'pulse', label: 'Pulse', hint: 'Growth, activation, audience', icon: PulseIcon },
  { view: 'screens', label: 'Screens', hint: 'Music video, swaps and branding in detail', icon: ScreensIcon },
  { view: 'feedback', label: 'Feedback', hint: 'What people wrote in', icon: FeedbackIcon },
];

export function isSecondary(view: AdminView): boolean {
  return SECONDARY_NAV.some((entry) => entry.view === view);
}
