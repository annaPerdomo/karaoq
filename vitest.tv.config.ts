import { defineConfig } from "vitest/config";

// Drives a real Chromium against a real `next start`, so it can't run under
// `pnpm test` (which is jsdom and offline). Needs a production build first:
//
//   pnpm build && pnpm test:tv
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/tv/**/*.tv.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
