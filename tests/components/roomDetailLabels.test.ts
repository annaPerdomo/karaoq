import { describe, it, expect } from "vitest";
import {
  languageLabel,
  roomLanguageLabel,
  roomLanguageTitle,
  type Person,
  type RoomLanguages,
} from "../../components/analytics/roomDetailLabels";

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

  // The whole point of localeSource: "they asked for Japanese" is a different
  // signal from "we guessed Japanese from their phone".
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

  it("reports unknown when nothing was recorded", () => {
    expect(roomLanguageLabel(undefined)).toBe("Language: unknown");
    expect(roomLanguageLabel(langs({ created: null }))).toBe("Language: unknown");
  });

  it("shows just the room's language when everyone matched it", () => {
    expect(
      roomLanguageLabel(langs({ byLocale: [{ locale: "en", people: 4, chosen: 0 }] }))
    ).toBe("English");
  });

  // A host in one language with singers in another is the case worth seeing.
  it("calls out people who ran in a different language", () => {
    expect(
      roomLanguageLabel(
        langs({
          byLocale: [
            { locale: "en", people: 3, chosen: 0 },
            { locale: "ja", people: 2, chosen: 2 },
          ],
        })
      )
    ).toBe("English · 2 in 日本語");
  });

  it("lists every differing language", () => {
    expect(
      roomLanguageLabel(
        langs({
          byLocale: [
            { locale: "ja", people: 2, chosen: 2 },
            { locale: "ko", people: 1, chosen: 1 },
          ],
        })
      )
    ).toBe("English · 2 in 日本語, 1 in 한국어");
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
      "English: 1 person, 0 picked it deliberately\n" +
        "日本語: 2 people, 2 picked it deliberately"
    );
  });
});
