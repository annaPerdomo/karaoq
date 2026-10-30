import * as React from 'react';

import fetchShelves from '../../../app/queue/fetchShelves';
import type { IdeaShelf } from '../../../lib/shelfTypes';
import { placesFor } from '../placeLists';

// Opens on the singer's own country every visit, by design: don't persist the pick.
export function usePlace(home: string | null, locale: string) {
  const homeValue = home ?? '';
  const [place, setPlace] = React.useState(homeValue);
  const [abroad, setAbroad] = React.useState<Record<string, IdeaShelf[]>>({});
  const failedRef = React.useRef<Record<string, true>>({});

  // Follows the country once geo resolves, until the singer picks.
  const pickedRef = React.useRef(false);
  React.useEffect(() => {
    if (!pickedRef.current) setPlace(homeValue);
  }, [homeValue]);

  const atHome = place === homeValue;
  React.useEffect(() => {
    if (atHome || abroad[place]) return;
    const controller = new AbortController();
    fetchShelves(place, locale, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      if (loaded === null) failedRef.current[place] = true;
      setAbroad((held) => ({ ...held, [place]: loaded ?? [] }));
    });
    return () => controller.abort();
  }, [place, atHome, abroad, locale]);

  function pick(next: string) {
    pickedRef.current = true;
    if (failedRef.current[next]) {
      delete failedRef.current[next];
      setAbroad((held) => {
        const rest = { ...held };
        delete rest[next];
        return rest;
      });
    }
    setPlace(next);
  }

  // A list that widened past the place would be mislabelled under its name.
  const placeShelves = atHome
    ? null
    : (abroad[place] ?? []).filter((s) => s.scope === 'country' && s.country === place);

  return {
    place,
    places: placesFor(home),
    atHome,
    placeShelves,
    placeLoading: !atHome && !abroad[place],
    pick,
  };
}
