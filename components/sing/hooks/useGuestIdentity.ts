import * as React from 'react';
import { getStoredName, setStoredName } from '../../../lib/username';

const NAME_STORAGE_KEY = 'karaoq_username';
// Per room: cheering from one night's welcome card must not hide it for every later room.
const skippedNameKey = (joinCode: string) => `karaoq_skipped_name:${joinCode}`;

export function useGuestIdentity(joinCode: string | undefined) {
  const [username, setUsername] = React.useState('');
  const [showWelcome, setShowWelcome] = React.useState(true);
  const [showTipsBanner, setShowTipsBanner] = React.useState(false);

  React.useEffect(() => {
    const saved = getStoredName(NAME_STORAGE_KEY);
    if (saved) {
      setUsername(saved);
      setShowWelcome(false);
    }
    try {
      if (joinCode && localStorage.getItem(skippedNameKey(joinCode))) setShowWelcome(false);
    } catch {
      /* private mode */
    }
    try {
      if (!localStorage.getItem('karaoq_seen_tips')) setShowTipsBanner(true);
    } catch {
      setShowTipsBanner(true);
    }
  }, [joinCode]);

  React.useEffect(() => {
    setStoredName(NAME_STORAGE_KEY, username);
  }, [username]);

  function handleWelcomeSubmit(name: string) {
    setUsername(name);
    setShowWelcome(false);
  }

  function skipName() {
    setShowWelcome(false);
    if (!joinCode) return;
    try {
      localStorage.setItem(skippedNameKey(joinCode), '1');
    } catch {
      /* private mode */
    }
  }

  function dismissTips() {
    setShowTipsBanner(false);
    try {
      localStorage.setItem('karaoq_seen_tips', '1');
    } catch {
      /* private mode */
    }
  }

  // Debounced: username updates per keystroke, and restarting the tracker on
  // each one would POST every partial name.
  const [trackedName, setTrackedName] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setTrackedName(username), 1500);
    return () => clearTimeout(timer);
  }, [username]);

  return {
    username,
    setUsername,
    showWelcome,
    showTipsBanner,
    trackedName,
    handleWelcomeSubmit,
    skipName,
    dismissTips,
  };
}
