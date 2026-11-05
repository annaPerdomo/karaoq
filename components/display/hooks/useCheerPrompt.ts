import * as React from 'react';

const CHEER_PROMPT_AFTER_MS = 20_000;
// Per screen session: two quiet songs means the room said no.
const MAX_PROMPTS = 2;

interface Args {
  active: boolean;
  songId: string | undefined;
  /** Two or more distinct singers in the queue: someone besides the singer is there. */
  audience: boolean;
  cheerCount: number;
  roomHasCheered: boolean;
  onPrompt: (songId: string) => void;
}

// Exists only to teach a room that cheering exists; once it has cheered, never again that session.
export function useCheerPrompt({ active, songId, audience, cheerCount, roomHasCheered, onPrompt }: Args): void {
  const cheerCountRef = React.useRef(cheerCount);
  cheerCountRef.current = cheerCount;
  const songIdRef = React.useRef(songId);
  songIdRef.current = songId;
  const onPromptRef = React.useRef(onPrompt);
  onPromptRef.current = onPrompt;
  const promptsRef = React.useRef(0);
  // A pause or Customize toggle re-arms the timer; one nudge per song regardless.
  const promptedSongRef = React.useRef<string | undefined>(undefined);
  const everCheeredRef = React.useRef(false);
  if (cheerCount > 0 || roomHasCheered) everCheeredRef.current = true;

  React.useEffect(() => {
    if (!active || !audience || !songId) return;
    if (everCheeredRef.current || promptsRef.current >= MAX_PROMPTS || promptedSongRef.current === songId) return;
    const timer = setTimeout(() => {
      if (cheerCountRef.current > 0 || everCheeredRef.current || songIdRef.current !== songId) return;
      promptsRef.current += 1;
      promptedSongRef.current = songId;
      onPromptRef.current(songId);
    }, CHEER_PROMPT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active, audience, songId]);
}
