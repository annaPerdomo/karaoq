import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockReq } from "../helpers/mockRequest";
import { clientIp, isProductionDeploy, requestCountry, requestGeo } from "../../lib/platform";

describe("requestGeo", () => {
  let prevVercel: string | undefined;
  beforeEach(() => {
    prevVercel = process.env.VERCEL;
  });
  afterEach(() => {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  });

  it("on Vercel, reads Vercel headers and ignores spoofed Cloudflare ones", () => {
    process.env.VERCEL = "1";
    const req = createMockReq({
      headers: {
        "x-vercel-ip-country": "US",
        "x-vercel-ip-region": "CA",
        "x-vercel-ip-city": "San%20Francisco",
        "cf-ipcountry": "GB",
        "cf-region-code": "ENG",
        "cf-ipcity": "London",
      },
    });
    expect(requestGeo(req)).toEqual({
      country: "US",
      region: "CA",
      city: "San%20Francisco",
    });
  });

  it("off Vercel, reads Cloudflare headers and ignores spoofed Vercel ones", () => {
    delete process.env.VERCEL;
    const req = createMockReq({
      headers: {
        "cf-ipcountry": "gb",
        "cf-region-code": "ENG",
        "cf-ipcity": "London",
        "x-vercel-ip-country": "US",
        "x-vercel-ip-region": "CA",
        "x-vercel-ip-city": "San%20Francisco",
      },
    });
    expect(requestGeo(req)).toEqual({
      country: "GB",
      region: "ENG",
      city: "London",
    });
  });

  it("off Vercel, normalises a UTF-8 cf-ipcity to the same percent-encoded form Vercel uses", () => {
    delete process.env.VERCEL;
    const rawUtf8City = Buffer.from("São Paulo", "utf8").toString("latin1");
    const req = createMockReq({
      headers: { "cf-ipcountry": "BR", "cf-ipcity": rawUtf8City },
    });
    expect(requestGeo(req).city).toBe("S%C3%A3o%20Paulo");
  });

  it("off Vercel, does not fall back to cf-region when cf-region-code is absent", () => {
    delete process.env.VERCEL;
    const req = createMockReq({
      headers: { "cf-ipcountry": "FR", "cf-region": "Ile-de-France" },
    });
    expect(requestGeo(req).region).toBeUndefined();
  });

  it.each(["XX", "T1", "xx", "t1"])(
    "off Vercel, drops an unknown/Tor Cloudflare country (%s)",
    (country) => {
      delete process.env.VERCEL;
      const req = createMockReq({ headers: { "cf-ipcountry": country } });
      expect(requestGeo(req).country).toBeUndefined();
    }
  );

  it("returns undefined fields when the active platform's headers are absent", () => {
    delete process.env.VERCEL;
    const req = createMockReq({ headers: {} });
    expect(requestGeo(req)).toEqual({
      country: undefined,
      region: undefined,
      city: undefined,
    });
  });

  it("requestCountry mirrors requestGeo().country", () => {
    process.env.VERCEL = "1";
    const req = createMockReq({ headers: { "x-vercel-ip-country": "JP" } });
    expect(requestCountry(req)).toBe("JP");
  });
});

describe("clientIp", () => {
  let prevVercel: string | undefined;
  beforeEach(() => {
    prevVercel = process.env.VERCEL;
  });
  afterEach(() => {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  });

  it("on Vercel, uses x-forwarded-for and ignores a spoofed cf-connecting-ip", () => {
    process.env.VERCEL = "1";
    const req = createMockReq({
      headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" },
    });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("off Vercel, prefers cf-connecting-ip", () => {
    delete process.env.VERCEL;
    const req = createMockReq({
      headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    delete process.env.VERCEL;
    const req = createMockReq({
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("5.6.7.8");
  });

  it("falls back to the socket's remote address, then unknown", () => {
    delete process.env.VERCEL;
    const req = createMockReq({ headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any);
    expect(clientIp(req)).toBe("127.0.0.1");
    expect(clientIp(createMockReq({ headers: {} }))).toBe("unknown");
  });

  it("on Vercel, a spoofed cf-connecting-ip doesn't change the rate-limit bucket key", () => {
    process.env.VERCEL = "1";
    const shared = { "x-forwarded-for": "203.0.113.9" };
    const reqA = createMockReq({ headers: { ...shared, "cf-connecting-ip": "198.51.100.1" } });
    const reqB = createMockReq({ headers: { ...shared, "cf-connecting-ip": "198.51.100.2" } });
    expect(clientIp(reqA)).toBe(clientIp(reqB));
  });

  it("off Vercel, two singers behind the same tunnel get distinct rate-limit buckets", () => {
    delete process.env.VERCEL;
    const shared = { "x-forwarded-for": "203.0.113.9" };
    const singerA = createMockReq({ headers: { ...shared, "cf-connecting-ip": "198.51.100.1" } });
    const singerB = createMockReq({ headers: { ...shared, "cf-connecting-ip": "198.51.100.2" } });
    expect(clientIp(singerA)).not.toBe(clientIp(singerB));
  });
});

describe("isProductionDeploy", () => {
  let prevVercelEnv: string | undefined;
  let prevKaraoqEnv: string | undefined;
  beforeEach(() => {
    prevVercelEnv = process.env.VERCEL_ENV;
    prevKaraoqEnv = process.env.KARAOQ_ENV;
  });
  afterEach(() => {
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
    if (prevKaraoqEnv === undefined) delete process.env.KARAOQ_ENV;
    else process.env.KARAOQ_ENV = prevKaraoqEnv;
  });

  it("is true for VERCEL_ENV=production", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.KARAOQ_ENV;
    expect(isProductionDeploy()).toBe(true);
  });

  it("is false for VERCEL_ENV=preview", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.KARAOQ_ENV;
    expect(isProductionDeploy()).toBe(false);
  });

  it("is true for KARAOQ_ENV=production", () => {
    delete process.env.VERCEL_ENV;
    process.env.KARAOQ_ENV = "production";
    expect(isProductionDeploy()).toBe(true);
  });

  it("is false when neither is set", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.KARAOQ_ENV;
    expect(isProductionDeploy()).toBe(false);
  });
});
