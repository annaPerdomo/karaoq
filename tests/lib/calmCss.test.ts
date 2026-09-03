import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Smart TVs never report `prefers-reduced-motion`, so every calm rule is
 * written twice: in the media query and under `html[data-tv]`. CSS can't
 * express that union in one place, so the guarantee lives here — and the file
 * list is discovered, so a stylesheet that grows a calm block is covered.
 */

const ROOT = join(__dirname, "../..");
const MEDIA = "@media (prefers-reduced-motion: reduce) {";

/** CSS modules only. globals.css's lone calm rule is `scroll-behavior` on a
 *  bare `html`, which costs a TV nothing and has no class to scope a twin to. */
const FILES = readdirSync(join(ROOT, "styles"))
  .filter((f) => f.endsWith(".module.css"))
  .map((f) => join("styles", f))
  .filter((f) => readFileSync(join(ROOT, f), "utf8").includes(MEDIA));
const TWIN_START = "/* @calm-twin-start */";
const TWIN_END = "/* @calm-twin-end */";

/** Strips comments and collapses whitespace so formatting can't fail the test. */
function normalize(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((rule) => rule.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((rule) => rule + " }");
}

/** Brace-matched so a nested block inside the at-rule doesn't end it early. */
function mediaBlocks(css: string): string[] {
  const blocks: string[] = [];
  let i = css.indexOf(MEDIA);
  while (i !== -1) {
    let depth = 0;
    let k = i + MEDIA.length - 1;
    const open = k;
    for (; k < css.length; k++) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(open + 1, k));
    i = css.indexOf(MEDIA, k);
  }
  return blocks;
}

function twinBlocks(css: string): string[] {
  const blocks: string[] = [];
  let i = css.indexOf(TWIN_START);
  while (i !== -1) {
    const end = css.indexOf(TWIN_END, i);
    blocks.push(css.slice(i + TWIN_START.length, end));
    i = css.indexOf(TWIN_START, end);
  }
  return blocks;
}

describe.each(FILES)("%s calm rules", (file) => {
  const css = readFileSync(join(ROOT, file), "utf8");
  const media = mediaBlocks(css);
  const twins = twinBlocks(css);

  it("has a TV twin for every reduced-motion block", () => {
    expect(media.length).toBeGreaterThan(0);
    expect(twins).toHaveLength(media.length);
  });

  it("keeps each twin's rules identical to its reduced-motion source", () => {
    media.forEach((block, i) => {
      const want = normalize(block);
      const got = normalize(twins[i]).map((r) =>
        r.replace(/html\[data-tv\] /g, "")
      );
      expect(got).toEqual(want);
    });
  });

  it("scopes every twin rule to html[data-tv] so it can't leak to desktop", () => {
    for (const twin of twins) {
      for (const rule of normalize(twin)) {
        const selector = rule.split("{")[0];
        for (const part of selector.split(",")) {
          expect(part.trim()).toMatch(/^html\[data-tv\] /);
        }
      }
    }
  });
});

describe("the TV flag itself", () => {
  it("is set from the shared classifier before first paint", () => {
    const doc = readFileSync(join(ROOT, "pages/_document.js"), "utf8");
    expect(doc).toContain("TV_PATTERN");
    expect(doc).toContain("data-tv");
    // Inline and blocking in <head>: deferring it would let the hero animate
    // for a frame before the TV is recognised.
    const tag = doc.match(/<script[^>]*dangerouslySetInnerHTML[^>]*\/>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).not.toMatch(/\b(defer|async|src=)/);
  });
});
