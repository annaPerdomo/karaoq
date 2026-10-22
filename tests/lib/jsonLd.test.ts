import { describe, it, expect } from "vitest";
import { jsonLdString } from "../../lib/jsonLd";

describe("jsonLdString", () => {
  it("escapes a closing script tag so embedded JSON can't break out of its <script>", () => {
    const value = { name: "</script><script>alert(1)</script>" };
    const result = jsonLdString(value);
    expect(result).not.toContain("</script>");
    expect(result).toContain("\\u003c/script>\\u003cscript>");
    expect(JSON.parse(result.replace(/\\u003c/g, "<"))).toEqual(value);
  });

  it("round-trips ordinary JSON-LD unchanged", () => {
    const value = { "@type": "ItemList", itemListElement: [{ position: 1, name: "A" }] };
    expect(JSON.parse(jsonLdString(value))).toEqual(value);
  });
});
