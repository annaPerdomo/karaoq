import { describe, it, expect } from "vitest";

import { isCutOf, matchHarvestToCatalog } from "../../lib/suggestionMatch";
import type { CatalogEntry } from "../../lib/suggestionCatalog";

function entry(title: string, artist: string): CatalogEntry {
  return {
    key: `${artist}|${title}`,
    query: `${artist} ${title} karaoke`,
    title,
    artist,
    packId: "core",
    categoryId: "test",
  };
}

function bilingual(
  title: string,
  nativeTitle: string,
  artist: string,
  nativeArtist: string
): CatalogEntry {
  return { ...entry(title, artist), nativeTitle, nativeArtist };
}

function video(title: string, videoId = "v1", channel = "SingKing") {
  return { videoId, title, thumbnailUrl: "t", channel };
}

const DANCING_QUEEN = entry("Dancing Queen", "ABBA");

describe("matchHarvestToCatalog", () => {
  it("matches however the channel orders artist and title", () => {
    const videos = [
      video("ABBA - Dancing Queen (Karaoke Version)", "a"),
      video("Dancing Queen - ABBA | Karaoke Version | KaraFun", "b"),
      video("Dancing Queen (In the Style of ABBA) [Instrumental]", "c"),
    ];

    const matched = matchHarvestToCatalog(videos, [DANCING_QUEEN], 5);

    expect(matched.get(DANCING_QUEEN.key)?.map((v) => v.videoId).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("files an upload titled in both scripts under its song once", () => {
    const song = bilingual("Gurenge", "紅蓮華", "LiSA", "LiSA");
    const upload = video("紅蓮華 Gurenge LiSA カラオケ", "both");

    const matched = matchHarvestToCatalog([upload], [song], 5);

    expect(matched.get(song.key)?.map((v) => v.videoId)).toEqual(["both"]);
  });

  it("keeps several channels' cuts — those are real arrangement choices", () => {
    const videos = [
      video("ABBA - Dancing Queen (Karaoke)", "a", "SingKing"),
      video("Dancing Queen - ABBA (Piano Karaoke)", "b", "sing2piano"),
    ];

    const matched = matchHarvestToCatalog(videos, [DANCING_QUEEN], 5);

    expect(matched.get(DANCING_QUEEN.key)).toHaveLength(2);
  });

  it("orders the tightest match first", () => {
    const videos = [
      video("ABBA - Dancing Queen - Karaoke Version, backing track for singers", "loose"),
      video("ABBA - Dancing Queen (Karaoke)", "tight"),
    ];

    const matched = matchHarvestToCatalog(videos, [DANCING_QUEEN], 5);

    expect(matched.get(DANCING_QUEEN.key)?.[0].videoId).toBe("tight");
  });

  it("refuses a title match with the wrong artist", () => {
    const videos = [video("Kylie Minogue - Dancing Queen (Karaoke)")];

    expect(matchHarvestToCatalog(videos, [DANCING_QUEEN], 5).size).toBe(0);
  });

  it("refuses an artist match with the wrong song", () => {
    const videos = [video("ABBA - Mamma Mia (Karaoke Version)")];

    expect(matchHarvestToCatalog(videos, [DANCING_QUEEN], 5).size).toBe(0);
  });

  it("doesn't let a short title collide across artists", () => {
    // "Dan" by Sheila on 7 is one word; without the artist check it matches every
    // Indonesian upload with "dan" in the title.
    const dan = entry("Dan", "Sheila on 7");
    const videos = [
      video("Sheila on 7 - Dan (Karaoke)", "right"),
      video("Noah - Separuh Aku dan Kamu (Karaoke)", "wrong"),
    ];

    const matched = matchHarvestToCatalog(videos, [dan], 5);

    expect(matched.get(dan.key)?.map((v) => v.videoId)).toEqual(["right"]);
  });

  it("survives the punctuation and accents channels actually use", () => {
    const ewf = entry("September", "Earth, Wind & Fire");
    const beyonce = entry("Halo", "Beyoncé");
    const videos = [
      video("Earth Wind and Fire - September | Karaoke Version", "ewf"),
      video("BEYONCE - HALO (KARAOKE VERSION)", "halo"),
    ];

    const matched = matchHarvestToCatalog(videos, [ewf, beyonce], 5);

    expect(matched.get(ewf.key)?.[0].videoId).toBe("ewf");
    expect(matched.get(beyonce.key)?.[0].videoId).toBe("halo");
  });

  it("caps how many cuts one song keeps", () => {
    const videos = Array.from({ length: 9 }, (_, i) =>
      video(`ABBA - Dancing Queen (Karaoke ${i})`, `v${i}`)
    );

    expect(matchHarvestToCatalog(videos, [DANCING_QUEEN], 4).get(DANCING_QUEEN.key))
      .toHaveLength(4);
  });

  it("ignores a channel upload that isn't a song at all", () => {
    const videos = [video("Karaoke Version - Official Channel Trailer")];

    expect(matchHarvestToCatalog(videos, [DANCING_QUEEN], 5).size).toBe(0);
  });
});

// Every case below is a real false positive the first live harvest produced.
describe("matchHarvestToCatalog — uploads that only look like tracks", () => {
  it("refuses a hashtagged short", () => {
    // "Hips Don't Lie comments section selections! #karaoke #shakira" carries
    // every word of the song and is not something a room can sing to.
    const hips = entry("Hips Don't Lie", "Shakira");
    const videos = [
      video("Hips Don't Lie comments section selections! #karaoke #shakira #challenge"),
    ];

    expect(matchHarvestToCatalog(videos, [hips], 5).size).toBe(0);
  });

  it("refuses a cover challenge", () => {
    const girls = entry("Girls Just Want to Have Fun", "Cyndi Lauper");
    const videos = [
      video("Cyndi Lauper - Girls Just Want To Have Fun | Cover Challenge - Pick your favorite!"),
    ];

    expect(matchHarvestToCatalog(videos, [girls], 5).size).toBe(0);
  });

  it("refuses a greatest-hits compilation", () => {
    const iwal = entry("I Will Always Love You", "Whitney Houston");
    const videos = [video("Whitney Houston Greatest Hits - Karaoke Collection (Vol. 2)")];

    expect(matchHarvestToCatalog(videos, [iwal], 5).size).toBe(0);
  });

  it("refuses a song whose words appear inside a different song", () => {
    // FILLER ate real title words: "Without You" collapsed to "you", which
    // "I Know What You Want" satisfies trivially.
    const withoutYou = entry("Without You", "Mariah Carey");
    const videos = [
      video("Busta Rhymes, Mariah Carey - I Know What You Want (Karaoke Version)"),
    ];

    expect(matchHarvestToCatalog(videos, [withoutYou], 5).size).toBe(0);
  });

  it("still matches the real cut of that same song", () => {
    const withoutYou = entry("Without You", "Mariah Carey");
    const videos = [video("Mariah Carey - Without You (Karaoke Version)", "real")];

    expect(matchHarvestToCatalog(videos, [withoutYou], 5).get(withoutYou.key))
      .toHaveLength(1);
  });

  it("matches a two-word song identity", () => {
    const halo = entry("Halo", "Beyoncé");
    const videos = [video("BEYONCE - HALO (KARAOKE VERSION)", "halo")];

    expect(matchHarvestToCatalog(videos, [halo], 5).get(halo.key)?.[0].videoId)
      .toBe("halo");
  });
});

describe("matchHarvestToCatalog — a title that identifies nothing", () => {
  it("refuses an entry whose title is contained in its own artist", () => {
    // Real catalog row: { title: "Enrique", artist: "Enrique Iglesias" }. The live
    // harvest duly claimed "Heroe" and "Addicted" for it.
    const miscurated = entry("Enrique", "Enrique Iglesias");
    const videos = [
      video("Enrique Iglesias - Heroe (Karaoke Version)"),
      video("Enrique Iglesias - Addicted (Karaoke)"),
    ];

    expect(matchHarvestToCatalog(videos, [miscurated], 5).size).toBe(0);
  });

  it("still matches a real song by that artist", () => {
    const bailando = entry("Bailando", "Enrique Iglesias");
    const videos = [video("Enrique Iglesias - Bailando (Karaoke Version)", "ok")];

    expect(matchHarvestToCatalog(videos, [bailando], 5).get(bailando.key))
      .toHaveLength(1);
  });
});

describe("matchHarvestToCatalog — native scripts", () => {
  function jp(): CatalogEntry {
    return {
      ...entry("Plastic Love", "Mariya Takeuchi"),
      nativeTitle: "プラスティック・ラブ",
      nativeArtist: "竹内まりや",
    };
  }

  it("matches an upload titled entirely in the native script", () => {
    // Japanese and Korean channels title in native script, so romanisation-only
    // matching found nothing for those packs.
    const videos = [video("竹内まりや - プラスティック・ラブ (カラオケ)", "native")];

    expect(matchHarvestToCatalog(videos, [jp()], 5).get(jp().key)?.[0].videoId)
      .toBe("native");
  });

  it("still matches the romanised upload of the same song", () => {
    const videos = [video("Mariya Takeuchi - Plastic Love (Karaoke Version)", "roman")];

    expect(matchHarvestToCatalog(videos, [jp()], 5).get(jp().key)?.[0].videoId)
      .toBe("roman");
  });

  it("matches a mixed-script upload", () => {
    const videos = [video("竹内まりや - Plastic Love (Karaoke)", "mixed")];

    expect(matchHarvestToCatalog(videos, [jp()], 5).get(jp().key)?.[0].videoId)
      .toBe("mixed");
  });

  it("still refuses the wrong song by the same native artist", () => {
    const videos = [video("竹内まりや - september (カラオケ)")];

    expect(matchHarvestToCatalog(videos, [jp()], 5).size).toBe(0);
  });
});

describe("isCutOf", () => {
  it("accepts a real karaoke cut of the song", () => {
    expect(isCutOf("ABBA - Dancing Queen (Karaoke Version)", DANCING_QUEEN))
      .toBe(true);
  });

  it("rejects a video that has nothing to do with the song", () => {
    expect(isCutOf("Rick Astley - Never Gonna Give You Up (Karaoke)", DANCING_QUEEN))
      .toBe(false);
  });

  it("rejects the right song from the wrong artist", () => {
    expect(isCutOf("Kylie Minogue - Dancing Queen (Karaoke)", DANCING_QUEEN))
      .toBe(false);
  });

  it("rejects a video that isn't a karaoke track at all", () => {
    expect(isCutOf("ABBA - Dancing Queen (Official Video)", DANCING_QUEEN))
      .toBe(false);
  });

  it("rejects a compilation that happens to name the song", () => {
    expect(isCutOf("ABBA Dancing Queen and more — Karaoke Medley", DANCING_QUEEN))
      .toBe(false);
  });
});
