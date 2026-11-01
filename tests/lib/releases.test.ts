import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import en from "../../lib/i18n/en.json";
import { guideById } from "../../lib/guides";
import {
  RELEASES,
  RELEASE_SLUGS,
  adjacentReleases,
  formatReleaseDate,
  highlightIndices,
  leadMedia,
  type Release,
} from "../../lib/releases";
import {
  DEFAULT_OG_IMAGE,
  releaseImage,
  releaseShareImage,
  releaseVideoSchemas,
  shareImagePath,
  whatsNewBlogSchema,
  whatsNewBreadcrumb,
} from "../../lib/releaseSchema";

const EN = en as Record<string, string>;
const ROOT = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const t = (key: string) => EN[key] ?? key;

const VIDEO = {
  kind: "video" as const,
  mp4: "/whats-new/x.mp4",
  poster: "/whats-new/x.webp",
  width: 1280,
  height: 720,
  seconds: 7.6,
};

function release(over: Partial<Release> = {}): Release {
  return { id: "t", slug: "t", date: "2026-01-01", highlightCount: 3, ...over };
}

describe("release catalog", () => {
  it("has unique ids and slugs", () => {
    expect(new Set(RELEASES.map((r) => r.id)).size).toBe(RELEASES.length);
    expect(new Set(RELEASE_SLUGS).size).toBe(RELEASES.length);
  });

  it("lists releases newest first with ISO dates", () => {
    for (const r of RELEASES) expect(r.date, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = RELEASES.map((r) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("has English copy for every page field and highlight", () => {
    for (const r of RELEASES) {
      for (const suffix of ["title", "metaDesc", "h1", "summary"]) {
        expect(EN[`release.${r.id}.${suffix}`], `${r.id}.${suffix}`).toBeTruthy();
      }
      for (const n of highlightIndices(r)) {
        expect(EN[`release.${r.id}.hl${n}.title`], `${r.id}.hl${n}.title`).toBeTruthy();
        expect(EN[`release.${r.id}.hl${n}.body`], `${r.id}.hl${n}.body`).toBeTruthy();
      }
    }
  });

  it("has no copy for a highlight past highlightCount", () => {
    for (const r of RELEASES) {
      expect(EN[`release.${r.id}.hl${r.highlightCount + 1}.title`], r.id).toBeUndefined();
    }
  });

  it("keys media to real highlights and ships every file", () => {
    for (const r of RELEASES) {
      for (const [n, media] of Object.entries(r.media ?? {})) {
        expect(Number(n), `${r.id}.media[${n}]`).toBeGreaterThanOrEqual(1);
        expect(Number(n), `${r.id}.media[${n}]`).toBeLessThanOrEqual(r.highlightCount);
        const files =
          media.kind === "video"
            ? [media.mp4, media.poster, ...(media.webm ? [media.webm] : [])]
            : [media.src];
        for (const f of files) {
          expect(fs.existsSync(path.join(ROOT, "public", f)), f).toBe(true);
        }
      }
    }
  });

  it("ships a 1200x630 share image for every landscape lead clip", () => {
    for (const r of RELEASES) {
      const media = leadMedia(r);
      if (!media || media.height > media.width) continue;
      const file = shareImagePath(media);
      expect(fs.existsSync(path.join(ROOT, "public", file)), `${r.id}: ${file}`).toBe(true);
    }
  });

  it("links only to guides that exist", () => {
    for (const r of RELEASES) {
      if (r.guide) expect(guideById(r.guide), `${r.id}.guide`).toBeDefined();
    }
  });
});

describe("release discoverability", () => {
  it("lists every release in the sitemap generator and the generated sitemap", () => {
    const script = read("scripts/gen-sitemap.mjs");
    const sitemap = read("public/sitemap.xml");
    expect(sitemap).toContain("<loc>https://www.karaoq.live/whats-new</loc>");
    for (const slug of RELEASE_SLUGS) {
      expect(script, slug).toContain(`'${slug}'`);
      expect(sitemap, slug).toContain(`/whats-new/${slug}</loc>`);
    }
  });

  it("lists every release in llms.txt", () => {
    const llms = read("public/llms.txt");
    for (const slug of RELEASE_SLUGS) expect(llms, slug).toContain(`/whats-new/${slug})`);
  });
});

describe("release helpers", () => {
  it("finds the newer and older neighbours, null at the ends", () => {
    const first = RELEASES[0];
    const last = RELEASES[RELEASES.length - 1];
    expect(adjacentReleases(first.id).newer).toBeNull();
    expect(adjacentReleases(first.id).older).toBe(RELEASES[1]);
    expect(adjacentReleases(last.id).older).toBeNull();
    expect(adjacentReleases("nope")).toEqual({ newer: null, older: null });
  });

  it("formats the date without shifting a day", () => {
    expect(formatReleaseDate("2026-10-31", "en")).toBe("October 31, 2026");
  });

  it("leads with the first highlight that has media", () => {
    expect(leadMedia(release())).toBeNull();
    expect(leadMedia(release({ media: { 3: VIDEO } }))).toBe(VIDEO);
  });
});

describe("release structured data", () => {
  it("emits a VideoObject per video clip only", () => {
    const image = { kind: "image" as const, src: "/whats-new/y.gif", width: 600, height: 400 };
    const r = release({ id: "musicvideo", media: { 1: VIDEO, 2: image } });
    const videos = releaseVideoSchemas(r, "en", t);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      "@type": "VideoObject",
      name: EN["release.musicvideo.hl1.title"],
      contentUrl: "https://www.karaoq.live/whats-new/x.mp4",
      thumbnailUrl: "https://www.karaoq.live/whats-new/x.webp",
      duration: "PT8S",
      uploadDate: "2026-01-01",
    });
  });

  it("shares the lead clip's 1200x630 cut, or the site image", () => {
    expect(releaseImage(release())).toBe(DEFAULT_OG_IMAGE);
    expect(releaseShareImage(release({ media: { 2: VIDEO } }))).toEqual({
      url: "https://www.karaoq.live/whats-new/x-og.jpg",
      width: 1200,
      height: 630,
    });
    const phone = { ...VIDEO, width: 640, height: 1386 };
    expect(releaseImage(release({ media: { 1: phone } }))).toBe(DEFAULT_OG_IMAGE);
  });

  it("lists every release in the localized blog index", () => {
    const blog = whatsNewBlogSchema("ja", t);
    expect(blog.url).toBe("https://www.karaoq.live/ja/whats-new");
    expect(blog.blogPost.map((p) => p.url)).toEqual(
      RELEASE_SLUGS.map((s) => `https://www.karaoq.live/ja/whats-new/${s}`)
    );
  });

  it("adds the release as a third breadcrumb", () => {
    expect(whatsNewBreadcrumb("en", t).itemListElement).toHaveLength(2);
    const crumbs = whatsNewBreadcrumb("en", t, RELEASES[0]).itemListElement;
    expect(crumbs[2].item).toBe(`https://www.karaoq.live/whats-new/${RELEASES[0].slug}`);
  });
});
