import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchYoutubeApi, YoutubeApiError } from "../../lib/youtubeApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function limitOf(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(response(status, body));
  try {
    await fetchYoutubeApi("https://example.test", 1000);
  } catch (e) {
    return e as YoutubeApiError;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  fetchMock.mockReset();
});

// The two limits arrive looking almost identical and are a day apart in
// consequence: the daily one latches a marker every room reads until midnight,
// the burst one clears in seconds. Conflating them is what told the whole
// platform search was dead while it was still answering.
describe("telling YouTube's limits apart", () => {
  it("reads a spent daily allowance as daily", async () => {
    const e = await limitOf(403, {
      error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] },
    });

    expect(e.limit).toBe("daily");
    expect(e.quotaExceeded).toBe(true);
  });

  it("reads the older dailyLimitExceeded spelling as daily too", async () => {
    const e = await limitOf(403, {
      error: { message: "Daily limit", errors: [{ reason: "dailyLimitExceeded" }] },
    });

    expect(e.limit).toBe("daily");
  });

  it("reads a short-window ceiling as burst, not as a spent day", async () => {
    const e = await limitOf(429, {
      error: {
        message: "Rate limit",
        errors: [{ reason: "rateLimitExceeded" }],
      },
    });

    expect(e.limit).toBe("burst");
    // Still a limit: the caller degrades to cache and corpus either way.
    expect(e.quotaExceeded).toBe(true);
  });

  it("reads a per-user ceiling as burst", async () => {
    const e = await limitOf(403, {
      error: {
        message: "User rate limit",
        errors: [{ reason: "userRateLimitExceeded" }],
      },
    });

    expect(e.limit).toBe("burst");
  });

  it("errs toward burst when the body names a limit without saying which", async () => {
    // Retrying costs one call and corrects itself; wrongly latching the day is
    // a one-way flag nothing clears until the Pacific reset.
    const e = await limitOf(429, {
      error: { message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" },
    });

    expect(e.limit).toBe("burst");
  });

  it("errs toward burst on a bare 429 with no body at all", async () => {
    const e = await limitOf(429, null);

    expect(e.limit).toBe("burst");
  });

  it("reads a spent day out of the message when no reason code says so", async () => {
    const e = await limitOf(429, {
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message:
          "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'youtube.googleapis.com'.",
      },
    });

    expect(e.limit).toBe("daily");
  });

  it("leaves a per-minute ceiling in the same shape as burst", async () => {
    const e = await limitOf(429, {
      error: {
        status: "RESOURCE_EXHAUSTED",
        message:
          "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user'.",
      },
    });

    expect(e.limit).toBe("burst");
  });
});

describe("recording what YouTube said", () => {
  it("carries the status, the reason and the message, markup stripped", async () => {
    const e = await limitOf(403, {
      error: {
        message:
          'The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.',
        errors: [{ reason: "quotaExceeded" }],
      },
    });

    expect(e.detail).toContain("403");
    expect(e.detail).toContain("quotaExceeded");
    expect(e.detail).toContain("exceeded your quota");
    expect(e.detail).not.toContain("<a");
  });

  it("falls back to the API status when there is no reason code", async () => {
    const e = await limitOf(429, {
      error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." },
    });

    expect(e.detail).toContain("RESOURCE_EXHAUSTED");
  });

  it("caps the detail so a long message can't bloat every analytics row", async () => {
    const e = await limitOf(500, { error: { message: "x".repeat(500) } });

    expect(e.detail.length).toBeLessThanOrEqual(200);
  });

  it("leaves an ordinary failure unflagged, so nothing degrades on a bad key", async () => {
    const e = await limitOf(400, {
      error: { message: "API key not valid", errors: [{ reason: "badRequest" }] },
    });

    expect(e.limit).toBeNull();
    expect(e.quotaExceeded).toBe(false);
  });

  it("throws on an error body that arrived with a 200", async () => {
    const e = await limitOf(200, {
      error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] },
    });

    expect(e.limit).toBe("daily");
  });

  it("hands back the payload when nothing went wrong", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { items: [{ id: "abc" }] }));

    await expect(fetchYoutubeApi("https://example.test", 1000)).resolves.toEqual({
      items: [{ id: "abc" }],
    });
  });
});
