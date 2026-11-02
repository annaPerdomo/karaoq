import { describe, it, expect } from "vitest";
import vercelConfig from "../vercel.json";

describe("vercel.json crons", () => {
  it("has exactly one mop-up entry at hour 6 UTC and one at hour 7 UTC", () => {
    const mopUpHours = vercelConfig.crons
      .filter((cron) => cron.path.includes("mopUp=1"))
      .map((cron) => Number(cron.schedule.split(" ")[1]));

    expect(mopUpHours.sort()).toEqual([6, 7]);
  });
});
