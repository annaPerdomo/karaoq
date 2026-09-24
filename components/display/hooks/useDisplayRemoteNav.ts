import * as React from 'react';
import { useRemoteNav } from './useRemoteNav';

interface DisplayEditNav {
  editing: boolean;
  dirty: boolean;
  discard: () => void;
}

// Same call as the Done button: discard() on a clean draft only exits.
export function useDisplayRemoteNav(
  pageRef: React.RefObject<HTMLElement>,
  enabled: boolean,
  edit: DisplayEditNav
): void {
  // useRemoteNav's initialFocus only runs on the first arrow press; this covers OK alone.
  React.useEffect(() => {
    if (!enabled || !edit.editing) return;
    pageRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus();
  }, [enabled, edit.editing, pageRef]);

  useRemoteNav(pageRef, {
    enabled,
    initialFocus: () =>
      pageRef.current?.querySelector<HTMLElement>('[data-remote="tap-start"]') ??
      pageRef.current?.querySelector<HTMLElement>('[data-remote="customize"]') ??
      null,
    onBack: edit.editing
      ? () => {
          if (edit.dirty) {
            pageRef.current?.querySelector<HTMLElement>('[data-remote="save"]')?.focus();
          } else {
            edit.discard();
          }
        }
      : undefined,
  });
}
