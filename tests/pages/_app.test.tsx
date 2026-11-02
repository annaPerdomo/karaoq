import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MyApp from "../../pages/_app";
import { getFirstTouch } from "../../lib/firstTouch";

const handlers: Record<string, ((...args: any[]) => void)[]> = {};
const routerEvents = {
  on: (event: string, handler: (...args: any[]) => void) => {
    (handlers[event] ||= []).push(handler);
  },
  off: (event: string, handler: (...args: any[]) => void) => {
    handlers[event] = (handlers[event] || []).filter((h) => h !== handler);
  },
};

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/sing/ABCDE",
    asPath: "/sing/ABCDE",
    isReady: true,
    events: routerEvents,
  }),
}));

vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

function emitRouteChangeComplete(url: string) {
  (handlers["routeChangeComplete"] || []).forEach((h) => h(url));
}

function Noop(): null {
  return null;
}

const ORIGINAL_SELF_HOST = process.env.NEXT_PUBLIC_KARAOQ_SELF_HOST;

beforeEach(() => {
  localStorage.clear();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  delete process.env.NEXT_PUBLIC_KARAOQ_SELF_HOST;
});

afterEach(() => {
  if (ORIGINAL_SELF_HOST === undefined) {
    delete process.env.NEXT_PUBLIC_KARAOQ_SELF_HOST;
  } else {
    process.env.NEXT_PUBLIC_KARAOQ_SELF_HOST = ORIGINAL_SELF_HOST;
  }
});

describe("MyApp first-touch capture", () => {
  it("captures a ref carried by an in-app client-side navigation", () => {
    render(<MyApp {...({ Component: Noop, pageProps: {} } as any)} />);

    emitRouteChangeComplete("/?ref=guest-sing");

    expect(getFirstTouch()?.ref).toBe("guest-sing");
  });
});

describe("MyApp Vercel Analytics gating", () => {
  it("renders Analytics by default", () => {
    render(<MyApp {...({ Component: Noop, pageProps: {} } as any)} />);

    expect(screen.queryByTestId("vercel-analytics")).not.toBeNull();
  });

  it("renders no Analytics when NEXT_PUBLIC_KARAOQ_SELF_HOST is set", () => {
    process.env.NEXT_PUBLIC_KARAOQ_SELF_HOST = "1";

    render(<MyApp {...({ Component: Noop, pageProps: {} } as any)} />);

    expect(screen.queryByTestId("vercel-analytics")).toBeNull();
  });
});
