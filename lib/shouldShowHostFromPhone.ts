// Only on the TV that started the room: a venue display is public, and a host
// link on every screen would let any guest take over.
export function shouldShowHostFromPhone(opts: {
  startedHere: boolean;
  hidden: boolean;
  editing: boolean;
  playing: boolean;
}): boolean {
  return opts.startedHere && !opts.hidden && !opts.editing && !opts.playing;
}
