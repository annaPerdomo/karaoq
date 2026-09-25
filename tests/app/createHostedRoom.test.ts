import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHostedRoom } from "../../app/queue/createHostedRoom";
import { getLastHostedRoom } from "../../lib/lastRoom";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createHostedRoom", () => {
  it("returns 'ok' and remembers the room on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response)
    );
    const result = await createHostedRoom("ABCDE");
    expect(result).toBe("ok");
    expect(getLastHostedRoom()?.code).toBe("ABCDE");
  });

  it("returns 'in-use' on a 409 without remembering the room", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409 }) as Response));
    const result = await createHostedRoom("ABCDE");
    expect(result).toBe("in-use");
    expect(getLastHostedRoom()).toBeNull();
  });

  it("returns 'error' on a 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    expect(await createHostedRoom("ABCDE")).toBe("error");
  });

  it("returns 'error' when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await createHostedRoom("ABCDE")).toBe("error");
  });

  it("sends x-custom-code when custom is requested", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response
    );
    vi.stubGlobal("fetch", fetchMock);
    await createHostedRoom("MYCODE", { custom: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/queue/MYCODE",
      expect.objectContaining({ headers: { "x-custom-code": "1" } })
    );
  });
});
