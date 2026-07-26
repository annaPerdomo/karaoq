import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LanguagesPanel, {
  type LanguageData,
} from "../../components/analytics/LanguagesPanel";

const data: LanguageData = {
  bySession: [
    { _id: "en", sessions: 10, rooms: 6, hosts: 4, singers: 6, chosen: 1 },
    { _id: "ja", sessions: 8, rooms: 4, hosts: 2, singers: 6, chosen: 6 },
  ],
  roomsCreated: [{ _id: "en", count: 6 }],
  byCountry: [{ _id: { country: "JP", locale: "ja" }, count: 3 }],
  // 6 en + 4 ja overlap in 2 rooms, so the per-locale sums (10) overcount — hence 8.
  uniqueRooms: 8,
  nonEnglishRooms: 4,
};

describe("LanguagesPanel", () => {
  it("shows the non-English share of rooms without double-counting mixed rooms", () => {
    render(<LanguagesPanel languages={data} />);
    expect(screen.getByText(/Non-English rooms: 4 of 8 \(50%\)/)).toBeTruthy();
  });

  it("names languages natively and reports how deliberate each pick was", () => {
    render(<LanguagesPanel languages={data} />);
    expect(screen.getByText("日本語")).toBeTruthy();
    // 6 of 8 Japanese sessions came from a switcher/URL pick, not a guess.
    expect(screen.getByText(/chosen by 75%/)).toBeTruthy();
  });

  it("explains itself before any data has arrived", () => {
    render(
      <LanguagesPanel languages={{ bySession: [], roomsCreated: [], byCountry: [] }} />
    );
    expect(screen.getByText(/No language data yet/)).toBeTruthy();
  });
});
