import { defineConfig } from "vitest/config";

// The tools call the real YouTube API and the database in .env.local; their own
// config keeps `pnpm test` from ever collecting them.
//
//   pnpm tool scripts/tools/probeHarvest.tool.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/tools/**/*.tool.ts"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
