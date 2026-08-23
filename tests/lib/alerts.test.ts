import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq } from "../helpers/mockRequest";

const mockInsertOne = vi.fn();
const mockDeleteOne = vi.fn();
const mockCreateIndex = vi.fn().mockResolvedValue("ok");

vi.mock("mongodb", () => ({
  MongoClient: function () {
    return {
      connect: vi.fn(),
      close: vi.fn(),
      db: () => ({
        collection: () => ({
          insertOne: mockInsertOne,
          deleteOne: mockDeleteOne,
          createIndex: mockCreateIndex,
        }),
      }),
    };
  },
}));

process.env.MONGODB_URI = "mongodb://test";
process.env.MONGODB_DB = "test-db";

import { resetQuotaAlertMemo, sendQuotaAlertOnce } from "../../lib/alerts";

const fetchMock = vi.fn();

/** A production request — nothing localhost or demo about it. */
function prodReq() {
  return createMockReq({ headers: { host: "www.karaoq.live" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetQuotaAlertMemo(); // module state, so it outlives clearAllMocks
  mockInsertOne.mockResolvedValue({});
  mockDeleteOne.mockResolvedValue({});
  process.env.NTFY_TOPIC = "karaoq-ops-test";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NTFY_TOPIC;
});

describe("sendQuotaAlertOnce", () => {
  it("pages on the day's first quota trip", async () => {
    await sendQuotaAlertOnce(prodReq());

    // Two writes: the durable quota-out marker room polls read, then the
    // alert mutex.
    expect(mockInsertOne).toHaveBeenCalledTimes(2);
    expect(mockInsertOne.mock.calls[0][0]._id).toMatch(
      /^quota-out:\d{4}-\d{2}-\d{2}$/
    );
    // The day rides on _id, not a secondary index: uniqueness has to hold on
    // the very first insert, before any index build could have finished.
    expect(mockInsertOne.mock.calls[1][0]._id).toMatch(/^quota:\d{4}-\d{2}-\d{2}$/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://ntfy.sh/karaoq-ops-test");
  });

  it("stays silent on every later trip the same day", async () => {
    mockInsertOne.mockRejectedValue({ code: 11000 });

    await sendQuotaAlertOnce(prodReq());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops touching Mongo once this instance has alerted today", async () => {
    await sendQuotaAlertOnce(prodReq());
    await sendQuotaAlertOnce(prodReq());
    await sendQuotaAlertOnce(prodReq());

    expect(mockInsertOne).toHaveBeenCalledTimes(2); // marker + mutex, once each
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not re-check Mongo after another instance won the day", async () => {
    mockInsertOne.mockRejectedValue({ code: 11000 });

    await sendQuotaAlertOnce(prodReq());
    await sendQuotaAlertOnce(prodReq());

    expect(mockInsertOne).toHaveBeenCalledTimes(2); // marker + mutex, once each
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent when the dedupe write fails for another reason", async () => {
    // Can't prove it's the first trip — one missed alert beats a page per search.
    mockInsertOne.mockRejectedValue(new Error("mongo down"));

    await expect(sendQuotaAlertOnce(prodReq())).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still records the quota-out day when no topic is configured", async () => {
    delete process.env.NTFY_TOPIC;

    await sendQuotaAlertOnce(prodReq());

    // The marker feeds the singer-facing "search is back" notice, so it must
    // not depend on paging being set up.
    expect(mockInsertOne).toHaveBeenCalledOnce();
    expect(mockInsertOne.mock.calls[0][0]._id).toMatch(
      /^quota-out:\d{4}-\d{2}-\d{2}$/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not page for localhost or demo traffic", async () => {
    await sendQuotaAlertOnce(createMockReq({ headers: { host: "localhost:3000" } }));
    await sendQuotaAlertOnce(
      createMockReq({ headers: { host: "www.karaoq.live", "x-karaoq-demo": "1" } })
    );

    expect(mockInsertOne).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows an ntfy outage", async () => {
    fetchMock.mockRejectedValue(new Error("ntfy unreachable"));

    await expect(sendQuotaAlertOnce(prodReq())).resolves.toBeUndefined();
  });

  it("releases the day so a failed send is retried, not lost", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ntfy unreachable"));

    await sendQuotaAlertOnce(prodReq());
    // Only the alert mutex (second insert) is released — the quota-out marker
    // must survive an ntfy failure.
    expect(mockDeleteOne).toHaveBeenCalledWith({
      _id: mockInsertOne.mock.calls[1][0]._id,
    });

    await sendQuotaAlertOnce(prodReq());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an ntfy error status as a failed send", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    await expect(sendQuotaAlertOnce(prodReq())).resolves.toBeUndefined();
    expect(mockDeleteOne).toHaveBeenCalledOnce();
  });
});
