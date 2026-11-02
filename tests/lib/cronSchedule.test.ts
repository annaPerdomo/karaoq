import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { insideMopUpWindow } from "../../lib/corpusBudget";

const { crons } = JSON.parse(
  readFileSync(join(__dirname, "../../vercel.json"), "utf8"),
) as { crons: { path: string; schedule: string }[] };

function firesAt(schedule: string, day: string): number {
  const [minute, hour] = schedule.split(" ");
  return Date.parse(`${day}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`);
}

// Vercel Pro fires crons on the minute, so a mop-up entry only runs if its
// exact time falls inside the window before the Pacific quota reset.
describe("vercel.json mop-up slots", () => {
  const mopUps = crons.filter((c) => c.path.includes("mopUp=1"));

  it.each([
    ["PDT", "2026-07-15"],
    ["PST", "2026-01-15"],
  ])("lands exactly one inside the window under %s", (_season, day) => {
    const inside = mopUps.filter((c) => insideMopUpWindow(firesAt(c.schedule, day)));
    expect(inside).toHaveLength(1);
  });
});
