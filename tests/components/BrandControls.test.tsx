import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { en } from "../../lib/i18n/messages";

const prepareLogo = vi.fn();
const uploadLogo = vi.fn();
const postScreenEvent = vi.fn();
vi.mock("../../lib/logoImage", () => ({ prepareLogo: (f: File) => prepareLogo(f) }));
vi.mock("../../app/queue/brand", () => ({
  uploadLogo: (r: string, d: string) => uploadLogo(r, d),
}));
vi.mock("../../app/queue/screenEvent", () => ({
  default: (...args: unknown[]) => postScreenEvent(...args),
}));

import BrandControls from "../../components/brand/BrandControls";

const HASH = "0123456789abcdef";

function pick(file = new File(["x"], "logo.png", { type: "image/png" })) {
  fireEvent.change(screen.getByTestId("brand-file"), { target: { files: [file] } });
}

beforeEach(() => {
  prepareLogo.mockReset();
  uploadLogo.mockReset();
  postScreenEvent.mockReset();
});

describe("BrandControls", () => {
  it("uploads the prepared logo and hands its hash to onChange", async () => {
    prepareLogo.mockResolvedValue("data:image/webp;base64,AAAA");
    uploadLogo.mockResolvedValue({ hash: HASH, url: "/x" });
    const onChange = vi.fn();
    const onBusyChange = vi.fn();
    render(
      <BrandControls
        roomId="ROOM1"
        brand={{ accentA: "#112233" }}
        onChange={onChange}
        onBusyChange={onBusyChange}
      />
    );
    expect(screen.getByText(en["brand.upload"])).toBeInTheDocument();

    pick();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
    expect(uploadLogo).toHaveBeenCalledWith("ROOM1", "data:image/webp;base64,AAAA");
    expect(onChange).toHaveBeenCalledWith({ accentA: "#112233", logo: HASH });
  });

  it("shows the current logo, and Remove clears it", () => {
    const onChange = vi.fn();
    render(<BrandControls roomId="ROOM1" brand={{ logo: HASH }} onChange={onChange} />);
    expect(screen.getByAltText(en["brand.logoAlt"])).toHaveAttribute(
      "src",
      `/api/queue/ROOM1/logo?h=${HASH}`
    );
    expect(screen.getByText(en["brand.replace"])).toBeInTheDocument();
    fireEvent.click(screen.getByText(en["brand.remove"]));
    expect(onChange.mock.calls[0][0].logo).toBeUndefined();
  });

  it("Use theme colours clears both accents", () => {
    const onChange = vi.fn();
    render(
      <BrandControls
        roomId="ROOM1"
        brand={{ logo: HASH, accentA: "#112233", accentB: "#445566" }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText(en["brand.useTheme"]));
    const next = onChange.mock.calls[0][0];
    expect(next.logo).toBe(HASH);
    expect(next.accentA).toBeUndefined();
    expect(next.accentB).toBeUndefined();
  });

  it("prefills the colour pickers with the theme accent when unset", () => {
    const { container } = render(
      <BrandControls roomId="ROOM1" brand={{ accentB: "#445566" }} onChange={() => {}} theme="minimal" />
    );
    const pickers = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    expect(pickers[0].value).toBe("#aab0c0");
    expect(pickers[1].value).toBe("#445566");
  });

  it("shows an inline error and reports a rejected file", async () => {
    prepareLogo.mockRejectedValue(new Error("type"));
    const onChange = vi.fn();
    render(<BrandControls roomId="ROOM1" brand={{}} onChange={onChange} />);
    pick(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en["brand.error.type"]);
    expect(postScreenEvent).toHaveBeenCalledWith("ROOM1", "logo_upload_rejected", { reason: "type" });
    expect(uploadLogo).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the paused message when the server's logo store is full", async () => {
    prepareLogo.mockResolvedValue("data:image/webp;base64,AAAA");
    uploadLogo.mockRejectedValue(new Error("full"));
    render(<BrandControls roomId="ROOM1" brand={{}} onChange={() => {}} />);
    await act(async () => pick());
    expect(await screen.findByRole("alert")).toHaveTextContent(en["brand.error.full"]);
    expect(postScreenEvent).not.toHaveBeenCalled();
  });
});
