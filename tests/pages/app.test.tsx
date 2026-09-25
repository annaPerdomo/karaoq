import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const analyticsProps: { path?: string; route?: string }[] = [];

vi.mock("@vercel/analytics/react", () => ({
  Analytics: (props: { path?: string; route?: string }) => {
    analyticsProps.push(props);
    return null;
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/remote/[joinCode]",
    asPath: "/remote/ABCDE#k=super-secret-key",
    isReady: true,
  }),
}));

vi.mock("../../lib/i18n/I18nProvider", () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useT: () => ({ t: (k: string) => k }),
}));

vi.mock("../../lib/errorReporting", () => ({ installErrorReporting: () => {} }));
vi.mock("../../components/feedback/FeedbackTrigger", () => ({ default: () => null }));
vi.mock("../../components/PwaHead", () => ({ default: () => null }));

import MyApp from "../../pages/_app";

describe("_app Analytics wiring", () => {
  it("never sends the URL fragment as the analytics path", () => {
    analyticsProps.length = 0;
    render(<MyApp Component={() => <div />} pageProps={{}} />);

    expect(analyticsProps).toHaveLength(1);
    expect(analyticsProps[0].path).toBe("/remote/ABCDE");
    expect(analyticsProps[0].path).not.toContain("#");
    expect(analyticsProps[0].path).not.toContain("super-secret-key");
  });
});
