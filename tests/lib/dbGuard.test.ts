import { describe, it, expect } from "vitest";
import { databaseRoleWarning } from "../../lib/dbGuard";

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe("databaseRoleWarning", () => {
  it("warns for a non-production process pointed at the prod db", () => {
    const warning = databaseRoleWarning(
      env({ NODE_ENV: "development", MONGODB_DB: "karaoq" })
    );
    expect(warning).toContain("karaoq");
  });

  it("stays quiet in production", () => {
    expect(
      databaseRoleWarning(env({ NODE_ENV: "production", MONGODB_DB: "karaoq" }))
    ).toBeNull();
  });

  it("warns on a Vercel preview, where NODE_ENV is production too", () => {
    const warning = databaseRoleWarning(
      env({ NODE_ENV: "production", VERCEL_ENV: "preview", MONGODB_DB: "karaoq" })
    );
    expect(warning).toContain("karaoq");
  });

  it("a preview warning still yields to the override", () => {
    expect(
      databaseRoleWarning(
        env({
          NODE_ENV: "production",
          VERCEL_ENV: "preview",
          MONGODB_DB: "karaoq",
          KARAOQ_ALLOW_PROD_DB: "1",
        })
      )
    ).toBeNull();
  });

  it("stays quiet on a non-prod database", () => {
    expect(
      databaseRoleWarning(env({ NODE_ENV: "development", MONGODB_DB: "karaoq_dev" }))
    ).toBeNull();
  });

  it("stays quiet with the override set", () => {
    expect(
      databaseRoleWarning(
        env({
          NODE_ENV: "development",
          MONGODB_DB: "karaoq",
          KARAOQ_ALLOW_PROD_DB: "1",
        })
      )
    ).toBeNull();
  });
});
