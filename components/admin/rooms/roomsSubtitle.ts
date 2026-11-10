/** "ever": the feature filter is all-time, unlike a Features card's window. */
export function roomsSubtitle(
  featureLabel: string | null,
  featureRooms: number | null,
  liveOnly: boolean
): string {
  if (featureLabel && featureRooms !== null) {
    return `${featureRooms} ${liveOnly ? 'live ' : ''}${
      featureRooms === 1 ? 'room has' : 'rooms have'
    } ever used ${featureLabel}, newest first.`;
  }
  return liveOnly
    ? 'Live rooms only. Tap one for the whole story.'
    : 'Every room, newest first. Tap one for the whole story.';
}
