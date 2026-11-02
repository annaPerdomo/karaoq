import { describe, it, expect } from "vitest";
import { insideMopUpWindow } from "../../lib/corpusBudget";

// deploy/crontab's two mopUp=1 slots: each lands inside insideMopUpWindow for
// one DST season only, by design — the other is a no-op until its window opens.
describe("deploy/crontab mop-up slot times", () => {
  it("06:47 UTC is inside the mop-up window on a PDT date", () => {
    const slot = new Date("2026-07-15T06:47:00Z").getTime();

    expect(insideMopUpWindow(slot)).toBe(true);
  });

  it("07:47 UTC is inside the mop-up window on a PST date", () => {
    const slot = new Date("2026-01-15T07:47:00Z").getTime();

    expect(insideMopUpWindow(slot)).toBe(true);
  });

  it("the PDT slot is outside the window on a PST date, and vice versa", () => {
    const pdtSlotOnPstDate = new Date("2026-01-15T06:47:00Z").getTime();
    const pstSlotOnPdtDate = new Date("2026-07-15T07:47:00Z").getTime();

    expect(insideMopUpWindow(pdtSlotOnPstDate)).toBe(false);
    expect(insideMopUpWindow(pstSlotOnPdtDate)).toBe(false);
  });
});
