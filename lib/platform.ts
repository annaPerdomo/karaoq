import type { IncomingHttpHeaders } from "http";

export interface RequestGeo {
  country?: string;
  region?: string;
  city?: string;
}

type GeoRequest = { headers: IncomingHttpHeaders };
type IpRequest = {
  headers: IncomingHttpHeaders;
  socket?: { remoteAddress?: string };
};

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

function cfCountry(value: string | string[] | undefined): string | undefined {
  const raw = headerString(value);
  if (!raw) return undefined;
  const country = raw.toUpperCase();
  return country === "XX" || country === "T1" ? undefined : country;
}

function cfCity(value: string | string[] | undefined): string | undefined {
  const raw = headerString(value);
  if (!raw) return undefined;
  return encodeURIComponent(Buffer.from(raw, "latin1").toString("utf8"));
}

export function requestGeo(req: GeoRequest): RequestGeo {
  if (onVercel()) {
    return {
      country: headerString(req.headers["x-vercel-ip-country"]),
      region: headerString(req.headers["x-vercel-ip-region"]),
      city: headerString(req.headers["x-vercel-ip-city"]),
    };
  }

  return {
    country: cfCountry(req.headers["cf-ipcountry"]),
    region: headerString(req.headers["cf-region-code"]),
    city: cfCity(req.headers["cf-ipcity"]),
  };
}

export function requestCountry(req: GeoRequest): string | undefined {
  return requestGeo(req).country;
}

export function clientIp(req: IpRequest): string {
  if (!onVercel()) {
    const cfIp = headerString(req.headers["cf-connecting-ip"]);
    if (cfIp) return cfIp;
  }
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp =
    typeof forwarded === "string" ? forwarded.split(",")[0].trim() : undefined;
  return forwardedIp || req.socket?.remoteAddress || "unknown";
}

export function isProductionDeploy(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.KARAOQ_ENV === "production"
  );
}
