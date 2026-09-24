import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const qrValues: string[] = [];
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => {
    qrValues.push(value);
    return <svg data-testid="qr" />;
  },
}));

import HostFromPhoneCard from "../../components/display/HostFromPhoneCard";

describe("HostFromPhoneCard", () => {
  it("points its QR at the host url, never the singer join flow, and calls onHide", () => {
    const onHide = vi.fn();
    render(<HostFromPhoneCard origin="https://karaoq.live" joinCode="ABCDE" onHide={onHide} />);

    expect(qrValues.at(-1)).toBe("https://karaoq.live/host/ABCDE");
    expect(screen.queryByText("ABCDE")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(onHide).toHaveBeenCalled();
  });
});
