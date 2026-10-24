import { describe, it, expect } from "vitest";
import { defaultWorldChart } from "../../components/songsearch/hooks/useWorldCharts";

describe("defaultWorldChart", () => {
  it("opens on a remembered pick while it's still offered", () => {
    expect(defaultWorldChart(["JP", "KR", "US"], "US", "KR")).toBe("KR");
    expect(defaultWorldChart(["JP", "US"], "US", "KR")).toBe("JP");
  });

  it("skips the singer's own country", () => {
    expect(defaultWorldChart(["JP", "US"], "JP", null)).toBe("US");
    expect(defaultWorldChart(["AR", "CL"], "AR", null)).toBe("CL");
  });

  it("falls back to anything offered, or nothing", () => {
    expect(defaultWorldChart(["US"], "US", null)).toBe("US");
    expect(defaultWorldChart([], "US", null)).toBeNull();
  });
});
