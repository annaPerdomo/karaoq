import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConnectTvForm } from "../../components/pairing/ConnectTvForm";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ConnectTvForm", () => {
  it("shows the invalid error without making a request when the code is malformed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectTvForm onPaired={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter the code shown on the tv/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects an 8-digit code without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectTvForm onPaired={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "48291753" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter the code shown on the tv/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("submits a claim for a spaced 6-digit code with the room", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ roomId: "ROOM1" }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onPaired = vi.fn();
    render(<ConnectTvForm roomId="ROOM1" onPaired={onPaired} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "482 917" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => expect(onPaired).toHaveBeenCalledWith({ roomId: "ROOM1" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tv-pair/482917/claim",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ roomId: "ROOM1" }) })
    );
    vi.unstubAllGlobals();
  });

  it("calls onNeedsRoom on a needs-room response and retries once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ roomId: "NEWROOM" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onNeedsRoom = vi.fn().mockResolvedValue("NEWROOM");
    const onPaired = vi.fn();
    render(<ConnectTvForm onPaired={onPaired} onNeedsRoom={onNeedsRoom} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "482917" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => expect(onPaired).toHaveBeenCalledWith({ roomId: "NEWROOM" }));
    expect(onNeedsRoom).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("reuses the room created by the first needs-room retry on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ status: 410, ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ roomId: "NEWROOM" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const onNeedsRoom = vi.fn().mockResolvedValue("NEWROOM");
    const onPaired = vi.fn();
    render(<ConnectTvForm onPaired={onPaired} onNeedsRoom={onNeedsRoom} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "482917" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.change(input, { target: { value: "111222" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith({ roomId: "NEWROOM" }));

    expect(onNeedsRoom).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdCallBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(thirdCallBody).toEqual({ roomId: "NEWROOM" });
  });

  it("shows the expired error on a 410", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 410, ok: false, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectTvForm onPaired={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "482917" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByText(/that code expired or was already used/i)).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });
});
