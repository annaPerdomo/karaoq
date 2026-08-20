import { defineConfig } from "vitest/config";

// The tools under scripts/tools call the real YouTube API and write to the
// real database in .env.local. Their own config keeps `pnpm test` from ever
// collecting them.
//
//   pnpm tool scripts/tools/probeHarvest.tool.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/tools/**/*.tool.ts"],
    // These make live API calls across thousands of uploads.
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
