import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider, useT } from "../../lib/i18n/I18nProvider";
import { getActiveLocale, asLocale, isLocaleSource } from "../../lib/i18n/activeLocale";

// The heartbeat reads this module mirror, not React state — sync is the contract under test.
function Probe(): React.ReactElement {
  const { locale, setLocale } = useT();
  return (
    <button onClick={() => setLocale("ko")}>
      current:{locale}
    </button>
  );
}

describe("asLocale / isLocaleSource", () => {
  it("accepts shipped locales and rejects anything else", () => {
    expect(asLocale("ja")).toBe("ja");
    expect(asLocale("xx")).toBeNull();
    expect(asLocale(null)).toBeNull();
    expect(asLocale(42)).toBeNull();
  });

  it("accepts known locale sources only", () => {
    expect(isLocaleSource("switch")).toBe(true);
    expect(isLocaleSource("browser")).toBe(true);
    expect(isLocaleSource("guessed")).toBe(false);
  });
});

describe("active locale mirror", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ country: null }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports a stored switcher pick as a deliberate choice", async () => {
    localStorage.setItem("karaoq_lang", "ja");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    await waitFor(() =>
      expect(getActiveLocale()).toEqual({ locale: "ja", source: "stored" })
    );
  });

  it("reports a mid-session switch as chosen", async () => {
    localStorage.setItem("karaoq_lang", "ja");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    await waitFor(() => expect(getActiveLocale().locale).toBe("ja"));

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(getActiveLocale()).toEqual({ locale: "ko", source: "switch" })
    );
  });

  it("marks a server-localized landing route as route-sourced", async () => {
    render(
      <I18nProvider initialLocale="cs" initialCatalog={{}}>
        <Probe />
      </I18nProvider>
    );
    await waitFor(() =>
      expect(getActiveLocale()).toEqual({ locale: "cs", source: "route" })
    );
  });
});
