// No imports: the browser bundle reads this.

export interface GenreDef {
  /** iTunes genre id (the tree under Music, id 34). */
  appleId: number;
  name: string;
  emoji: string;
}

export const GENRES: Record<string, GenreDef> = {
  pop: { appleId: 14, name: "Pop", emoji: "💃" },
  rock: { appleId: 21, name: "Rock", emoji: "🎸" },
  country: { appleId: 6, name: "Country", emoji: "🤠" },
  hiphop: { appleId: 18, name: "Hip-Hop", emoji: "🎧" },
  rnb: { appleId: 15, name: "R&B / Soul", emoji: "🎷" },
  alternative: { appleId: 20, name: "Alternative", emoji: "🌀" },
  musicals: { appleId: 1166, name: "Musicals", emoji: "🎭" },
  "soft-hits": { appleId: 1131, name: "Soft Hits", emoji: "🕯️" },
  "singer-songwriter": { appleId: 10, name: "Singer-Songwriter", emoji: "🪕" },
  kpop: { appleId: 51, name: "K-Pop", emoji: "💜" },
  trot: { appleId: 1261, name: "Trot", emoji: "🎺" },
  "k-rock": { appleId: 1249, name: "K-Rock & Bands", emoji: "🥁" },
  "k-indie": { appleId: 1231, name: "K-Indie", emoji: "🌙" },
  jpop: { appleId: 27, name: "J-Pop", emoji: "🌸" },
  anime: { appleId: 29, name: "Anime", emoji: "⚔️" },
  enka: { appleId: 28, name: "Enka", emoji: "🍶" },
  kayokyoku: { appleId: 30, name: "Kayōkyoku", emoji: "📻" },
  mandopop: { appleId: 1253, name: "Mandopop", emoji: "🏮" },
  cantopop: { appleId: 1251, name: "Cantopop", emoji: "🌃" },
  "chinese-rock": { appleId: 1248, name: "Chinese Rock", emoji: "🎸" },
  "chinese-hiphop": { appleId: 1241, name: "Chinese Hip-Hop", emoji: "🎧" },
  opm: { appleId: 1257, name: "OPM", emoji: "🌴" },
  "pinoy-pop": { appleId: 1256, name: "Pinoy Pop", emoji: "✨" },
  "indo-pop": { appleId: 1259, name: "Pop Indonesia", emoji: "🌺" },
  dangdut: { appleId: 1274, name: "Dangdut", emoji: "🥁" },
  "malay-pop": { appleId: 1255, name: "Pop Melayu", emoji: "🌺" },
  bollywood: { appleId: 1263, name: "Bollywood", emoji: "🎬" },
  punjabi: { appleId: 100045, name: "Punjabi", emoji: "🥁" },
  "indian-pop": { appleId: 1185, name: "Indian Pop", emoji: "🎶" },
  tamil: { appleId: 1264, name: "Tamil", emoji: "🌺" },
  telugu: { appleId: 1265, name: "Telugu", emoji: "🪷" },
  ghazal: { appleId: 1278, name: "Ghazal", emoji: "🌙" },
  schlager: { appleId: 50000066, name: "Schlager & Pop", emoji: "🎉" },
  volksmusik: { appleId: 50000068, name: "Volksmusik & Karneval", emoji: "🍻" },
  deutschpop: { appleId: 50000133, name: "Deutschpop", emoji: "🎶" },
  deutschrap: { appleId: 50000136, name: "Deutschrap", emoji: "🎧" },
  "french-pop": { appleId: 50000064, name: "Pop française", emoji: "🥐" },
  urbano: { appleId: 1119, name: "Urbano latino", emoji: "🔊" },
  "pop-latino": { appleId: 1117, name: "Pop latino", emoji: "💃" },
  tropical: { appleId: 1124, name: "Tropical", emoji: "🌴" },
  baladas: { appleId: 1120, name: "Baladas y boleros", emoji: "💔" },
  "rock-latino": { appleId: 1121, name: "Rock en español", emoji: "🎸" },
  mexicana: { appleId: 1123, name: "Música mexicana", emoji: "🤠" },
  flamenco: { appleId: 1295, name: "Flamenco", emoji: "🌹" },
  sertanejo: { appleId: 1228, name: "Sertanejo", emoji: "🤠" },
  pagode: { appleId: 1226, name: "Pagode", emoji: "🥁" },
  "funk-br": { appleId: 1229, name: "Funk", emoji: "🔊" },
  mpb: { appleId: 1225, name: "MPB", emoji: "🌅" },
  forro: { appleId: 1223, name: "Forró", emoji: "🪗" },
  gospel: { appleId: 1101, name: "Gospel", emoji: "🙏" },
  brazilian: { appleId: 1122, name: "Música brasileira", emoji: "🌴" },
  fado: { appleId: 1297, name: "Fado", emoji: "🎻" },
};

const ENGLISH = ["pop", "rock", "country", "rnb", "hiphop"];

/** Dance and most Alternative charts are filler nobody sings, so they're left out. */
export const PLACE_GENRES: Record<string, string[]> = {
  us: ["pop", "country", "rnb", "rock", "hiphop", "alternative", "musicals"],
  gb: ["pop", "rock", "rnb", "hiphop", "alternative", "musicals"],
  au: ENGLISH,
  nz: ENGLISH,
  ca: ENGLISH,
  ph: ["opm", "pinoy-pop", "soft-hits", "kpop", "rnb", "pop"],
  de: ["schlager", "volksmusik", "deutschpop", "deutschrap", "rock", "pop"],
  es: ["pop-latino", "urbano", "rock-latino", "flamenco", "pop"],
  mx: ["mexicana", "urbano", "pop-latino", "baladas", "rock-latino", "tropical"],
  tw: ["mandopop", "cantopop", "chinese-rock", "kpop", "jpop", "chinese-hiphop"],
  my: ["malay-pop", "indo-pop", "mandopop", "kpop", "pop"],
  fr: ["french-pop", "hiphop", "rnb", "rock", "pop"],
  it: ["pop", "rock", "hiphop", "singer-songwriter"],
  br: ["sertanejo", "pagode", "funk-br", "mpb", "forro", "gospel", "rock"],
  id: ["indo-pop", "dangdut", "kpop", "rock", "pop"],
  jp: ["anime", "jpop", "enka", "kayokyoku", "rock", "alternative", "kpop"],
  kr: ["kpop", "trot", "k-rock", "k-indie"],
  in: ["bollywood", "punjabi", "indian-pop", "tamil", "telugu", "ghazal"],
  cz: ["pop", "rock", "hiphop"],
  co: ["urbano", "tropical", "pop-latino", "mexicana", "baladas", "rock-latino"],
  ar: ["rock-latino", "urbano", "tropical", "pop-latino", "baladas"],
  cl: ["urbano", "pop-latino", "tropical", "baladas", "rock-latino", "mexicana"],
  pe: ["urbano", "pop-latino", "tropical", "baladas", "rock-latino"],
  pt: ["fado", "brazilian", "pop", "rock", "hiphop"],
};

/** Korea has no iTunes store; the US store carries its genres. */
const STORE_FOR: Record<string, string> = { kr: "us" };

export function storeFor(place: string): string {
  const cc = place.toLowerCase();
  return STORE_FOR[cc] ?? cc;
}

export function genreChartId(place: string, slug: string): string {
  return `${place.toLowerCase()}:${slug}`;
}

export function parseGenreChartId(id: string): { place: string; slug: string } {
  const at = id.indexOf(":");
  return { place: id.slice(0, at), slug: id.slice(at + 1) };
}

export const GENRE_CHART_IDS: string[] = Object.keys(PLACE_GENRES).flatMap((place) =>
  PLACE_GENRES[place].map((slug) => genreChartId(place, slug))
);
