import { QueueEntry } from '../../../pages/api/types';

// Stand-in queue so the depth/size drags have something visible to resize even
// while the real queue is short. Names/titles are content, not UI — untranslated.
export const SAMPLE_QUEUE: QueueEntry[] = [
  ['Mia', 'Dancing Queen - ABBA'],
  ['Leo', "Livin' on a Prayer - Bon Jovi"],
  ['Priya', 'Bohemian Rhapsody - Queen'],
  ['Sam', 'Sweet Caroline - Neil Diamond'],
  ['Noa', 'Shallow - Lady Gaga & Bradley Cooper'],
  ['Kenji', 'Take On Me - a-ha'],
  ['Rosa', 'I Will Survive - Gloria Gaynor'],
  ['Tom', "Don't Stop Believin' - Journey"],
  ['Ada', 'Wannabe - Spice Girls'],
  ['Zoe', 'Valerie - Amy Winehouse'],
  ['Ivan', 'Mr. Brightside - The Killers'],
  ['June', '9 to 5 - Dolly Parton'],
  ['Omar', 'Karma Chameleon - Culture Club'],
  ['Lily', 'Total Eclipse of the Heart - Bonnie Tyler'],
  ['Max', 'Country Roads - John Denver'],
  ['Nina', 'Islands in the Stream - Kenny Rogers & Dolly Parton'],
].map(([userName, songTitle], i) => ({
  id: `sample-${i}`,
  userName,
  songTitle,
  videoId: 'sample00000',
}));
