// FAQ content, exported so the landing page can mirror it in FAQPage structured data.
// Google requires the JSON-LD text to match the visible answers, so keep both
// sourced from here. The English text here is what SSR + JSON-LD emit (kept
// consistent for SEO); `id` maps each item to its faq.* translation keys, which
// the client swaps in for the visitor's language.
export const FAQ_ITEMS: {
  id: string;
  question: string;
  answer: string;
  /** Optional guide slug — renders a "read more" link under the answer. */
  guideSlug?: string;
}[] = [
  {
    id: 'free',
    question: 'Is KaraoQ free to use?',
    answer:
      'Yes. KaraoQ is free to host and free to join. Songs play from YouTube, so there is nothing to buy or rent.',
  },
  {
    id: 'app',
    question: 'Do I need to download an app?',
    answer:
      'No downloads and no installs. KaraoQ runs entirely in your web browser on phones, tablets, laptops, and smart TVs.',
  },
  {
    id: 'equipment',
    question: 'What equipment do I need to host karaoke night?',
    answer:
      'A device with a browser and something that makes sound — a laptop or iPad on its own is enough. For a bigger night, put the video on a TV by casting or plugging in with HDMI. No karaoke machine or microphones required.',
  },
  {
    id: 'mics',
    question: 'Do I need a microphone for karaoke?',
    answer:
      "No. KaraoQ puts the song and the lyrics on screen, and plenty of living rooms just sing along out loud. A microphone is the upgrade that makes it feel like a real karaoke night — a cheap wireless pair plugged into a Bluetooth speaker's mic input is the setup most people land on. Run the mic through the speaker rather than pairing it to the TV, so voices and backing track come out of the same box and stay in sync.",
    guideSlug: 'cheap-home-karaoke-setup',
  },
  {
    id: 'tv',
    question: 'How do I get the karaoke video on my TV?',
    answer:
      'Cast your screen with AirPlay or Google Cast, or connect your laptop to the TV with an HDMI cable. KaraoQ can also pop the video out into its own window, so the TV shows the song and lyrics while the controls stay on your screen.',
  },
  {
    id: 'account',
    question: 'Do my guests need an account to sing?',
    answer:
      'No sign-up is required for anyone. Guests scan a QR code or enter the room code, then start adding songs from their own phones.',
  },
  {
    id: 'join',
    question: 'How do guests join the karaoke session?',
    answer:
      'Create a room to get a short join code and QR code. Share either one, and guests can search YouTube and queue songs from their phones in seconds.',
  },
  {
    id: 'songs',
    question: 'Where do the karaoke songs come from?',
    answer:
      'Every song streams from YouTube, so you have millions of karaoke tracks, lyric videos, and instrumentals to choose from — no separate karaoke library needed.',
  },
  {
    id: 'venue',
    question: 'Can I use KaraoQ at a bar, party, or venue?',
    answer:
      'Absolutely. Cast the queue to any screen and let guests add songs from their phones. It works just as well for house parties, team events, and venue karaoke nights.',
  },
];
