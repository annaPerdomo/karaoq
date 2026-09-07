import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A `.songControlStaged > *` rule ties on specificity with `.scene`'s own class
 * (styles/Countdown.module.css), so the winner depends on module concatenation
 * order — which differs between `next dev` and a production build. It shipped
 * once: the scene turned `relative`, collapsed to 0x0, and karaoq.live lost the
 * crowd while dev looked right. Stacking belongs to the children's own rules.
 */

const CSS = readFileSync(join(__dirname, "../../styles/Host.module.css"), "utf8");

function childRules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/\s+/g, " ").trim();
    // A combinator after the class, not `.songControlStaged` itself or a
    // pseudo-class/compound selector on it.
    if (/\.songControlStaged[^,{]*[\s>+~][^,{]+/.test(selector)) {
      out.push({ selector, body: match[2] });
    }
  }
  return out;
}

describe("the staged host stage", () => {
  it("never sets position on the count-in's children", () => {
    const offenders = childRules(CSS)
      .filter(({ body }) => /(^|[;\s])position\s*:/.test(body))
      .map(({ selector }) => selector);

    expect(offenders).toEqual([]);
  });
});
