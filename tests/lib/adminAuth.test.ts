import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockReq } from "../helpers/mockRequest";
import { isAuthorizedAdmin } from "../../lib/adminAuth";

const ORIGINAL = process.env.ANALYTICS_SECRET;

describe("isAuthorizedAdmin", () => {
  beforeEach(() => {
    process.env.ANALYTICS_SECRET = "s3cret";
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ANALYTICS_SECRET;
    else process.env.ANALYTICS_SECRET = ORIGINAL;
  });

  it("accepts the correct secret", () => {
    const req = createMockReq({ headers: { "x-analytics-secret": "s3cret" } });
    expect(isAuthorizedAdmin(req)).toBe(true);
  });

  it("rejects a wrong secret, including one of a different length", () => {
    expect(
      isAuthorizedAdmin(createMockReq({ headers: { "x-analytics-secret": "nope" } }))
    ).toBe(false);
    expect(
      isAuthorizedAdmin(
        createMockReq({ headers: { "x-analytics-secret": "s3cret-but-longer" } })
      )
    ).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedAdmin(createMockReq())).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    delete process.env.ANALYTICS_SECRET;
    const req = createMockReq({ headers: { "x-analytics-secret": "" } });
    expect(isAuthorizedAdmin(req)).toBe(false);
  });
});
