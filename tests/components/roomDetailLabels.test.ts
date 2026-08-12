import { describe, it, expect } from "vitest";
import {
  languageLabel,
  languageMixShort,
  languageMixTitle,
  roomLanguageLabel,
  roomLanguageTitle,
  type Person,
  type RoomLanguages,
} from "../../components/admin/roomDetailLabels";

function person(over: Partial<Person> = {}): Person {
  return {
    userName: "Anna",
    role: "host",
    firstSeen: null,
    lastSeen: null,
    country: null,
    city: null,
    locale: null,
    localeSource: null,
    ...over,
  };
}

describe("languageLabel", () => {
  it("is blank when no language was recorded", () => {
    expect(languageLabel(person())).toBe("");
  });

  it("names the language in its own script", () => {
    expect(languageLabel(person({ locale: "ja", localeSource: "browser" }))).toBe(
      "日本語"
    );
  });

  it.each(["switch", "stored", "url"])(
    "marks %s as a deliberate pick",
    (localeSource) => {
      expect(languageLabel(person({ locale: "es", localeSource }))).toBe(
        "Español (picked)"
      );
    }
  );

  it.each(["browser", "geo", "route", "default"])(
    "leaves %s unmarked as a guess",
    (localeSource) => {
      expect(languageLabel(person({ locale: "es", localeSource }))).toBe("Español");
    }
  );

  it("falls back to the raw code for an unrecognized locale", () => {
    expect(languageLabel(person({ locale: "xx", localeSource: "geo" }))).toBe("xx");
  });
});

describe("roomLanguageLabel", () => {
  const langs = (over: Partial<RoomLanguages> = {}): RoomLanguages => ({
    created: "en",
    byLocale: [],
    ...over,
  });

  it("reports unknown when nothing at all was recorded", () => {
    expect(roomLanguageLabel(undefined)).toBe("Language not recorded");
    expect(roomLanguageLabel(langs({ created: null }))).toBe("Language not recorded");
  });

  it("falls back to the creation language when no one's was recorded", () => {
    expect(roomLanguageLabel(langs())).toBe("Created in English");
  });

  it("shows just the room's language when everyone matched it", () => {
    expect(
      roomLanguageLabel(langs({ byLocale: [{ locale: "en", people: 4, chosen: 0 }] }))
    ).toBe("English 4");
  });

  it("leads with what people ran in even when the creation language is missing", () => {
    expect(
      roomLanguageLabel(
        langs({
          created: null,
          byLocale: [
            { locale: "en", people: 3, chosen: 0 },
            { locale: "pt", people: 1, chosen: 0 },
          ],
        })
      )
    ).toBe("English 3 · Português 1");
  });

  it("orders the mix by head count, biggest group first", () => {
    expect(
      roomLanguageLabel(
        langs({
          byLocale: [
            { locale: "ko", people: 1, chosen: 1 },
            { locale: "ja", people: 2, chosen: 2 },
          ],
        })
      )
    ).toBe("日本語 2 · 한국어 1");
  });
});

describe("languageMixShort", () => {
  it("is an em dash when nothing was recorded", () => {
    expect(languageMixShort([])).toBe("—");
  });

  it("is the bare code for a single-language room", () => {
    expect(languageMixShort([{ locale: "en", people: 4 }])).toBe("EN");
  });

  it("counts the other languages against the dominant one", () => {
    expect(
      languageMixShort([
        { locale: "pt", people: 1 },
        { locale: "en", people: 3 },
        { locale: "ja", people: 1 },
      ])
    ).toBe("EN +2");
  });
});

describe("languageMixTitle", () => {
  it("says so rather than staying silent when nothing was recorded", () => {
    expect(languageMixTitle([], null)).toBe(
      "No participant language was recorded.\n" +
        "The language the room was created in was not recorded."
    );
  });

  it("breaks down the mix and names the creation language", () => {
    expect(
      languageMixTitle(
        [
          { locale: "en", people: 3 },
          { locale: "pt", people: 1 },
        ],
        "en"
      )
    ).toBe("English: 3 people\nPortuguês: 1 person\nRoom created in English.");
  });
});

describe("roomLanguageTitle", () => {
  it("explains the absence rather than rendering an empty tooltip", () => {
    expect(roomLanguageTitle(undefined)).toMatch(/No language was recorded/);
  });

  it("breaks down head count and deliberate picks per language", () => {
    expect(
      roomLanguageTitle({
        created: "en",
        byLocale: [
          { locale: "en", people: 1, chosen: 0 },
          { locale: "ja", people: 2, chosen: 2 },
        ],
      })
    ).toBe(
      "日本語: 2 people, 2 picked it deliberately\n" +
        "English: 1 person, 0 picked it deliberately\n" +
        "Room created in English."
    );
  });

  it("names the creation language as missing rather than omitting the line", () => {
    expect(
      roomLanguageTitle({ created: null, byLocale: [{ locale: "pt", people: 1, chosen: 0 }] })
    ).toBe(
      "Português: 1 person, 0 picked it deliberately\n" +
        "The language the room was created in was not recorded."
    );
  });
});
