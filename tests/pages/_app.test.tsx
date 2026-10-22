import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
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
  Analytics: () => null,
}));

function emitRouteChangeComplete(url: string) {
  (handlers["routeChangeComplete"] || []).forEach((h) => h(url));
}

function Noop(): null {
  return null;
}

beforeEach(() => {
  localStorage.clear();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
});

describe("MyApp first-touch capture", () => {
  it("captures a ref carried by an in-app client-side navigation", () => {
    render(<MyApp {...({ Component: Noop, pageProps: {} } as any)} />);

    emitRouteChangeComplete("/?ref=guest-sing");

    expect(getFirstTouch()?.ref).toBe("guest-sing");
  });
});
