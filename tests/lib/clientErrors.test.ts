import { describe, it, expect } from "vitest";
import {
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_ERROR_PAGE_LENGTH,
  MAX_ERROR_STACK_LENGTH,
  sanitizeClientError,
} from "../../lib/clientErrors";

describe("sanitizeClientError", () => {
  it("accepts a full report", () => {
    const result = sanitizeClientError({
      message: "TypeError: x is not a function",
      stack: "TypeError: x is not a function\n  at handler (app.js:1:1)",
      source: "window",
      page: "/host/ABCD",
      roomId: "ABCD",
    });
    expect(result).toEqual({
      message: "TypeError: x is not a function",
      stack: "TypeError: x is not a function\n  at handler (app.js:1:1)",
      source: "window",
      page: "/host/ABCD",
      roomId: "ABCD",
    });
  });

  it("rejects a missing or empty message", () => {
    expect(sanitizeClientError({})).toBeNull();
    expect(sanitizeClientError({ message: "   " })).toBeNull();
    expect(sanitizeClientError({ message: 42 })).toBeNull();
    expect(sanitizeClientError(null)).toBeNull();
    expect(sanitizeClientError("boom")).toBeNull();
  });

  it("truncates over-long fields instead of rejecting them", () => {
    const result = sanitizeClientError({
      message: "m".repeat(1000),
      stack: "s".repeat(10_000),
      page: "/p".repeat(500),
    });
    expect(result?.message).toHaveLength(MAX_ERROR_MESSAGE_LENGTH);
    expect(result?.stack).toHaveLength(MAX_ERROR_STACK_LENGTH);
    expect(result?.page).toHaveLength(MAX_ERROR_PAGE_LENGTH);
  });

  it("defaults an unknown source to window", () => {
    expect(sanitizeClientError({ message: "boom", source: "hacker" })?.source).toBe(
      "window"
    );
    expect(sanitizeClientError({ message: "boom", source: "promise" })?.source).toBe(
      "promise"
    );
  });

  it("drops an over-long roomId to '' rather than storing it", () => {
    expect(
      sanitizeClientError({ message: "boom", roomId: "R".repeat(65) })?.roomId
    ).toBe("");
    expect(sanitizeClientError({ message: "boom" })?.roomId).toBe("");
    expect(sanitizeClientError({ message: "boom", roomId: "ABCD" })?.roomId).toBe(
      "ABCD"
    );
  });

  it("canonicalizes roomId to uppercase", () => {
    expect(sanitizeClientError({ message: "boom", roomId: "abcd1" })?.roomId).toBe(
      "ABCD1"
    );
  });

  it("omits stack and page when absent", () => {
    const result = sanitizeClientError({ message: "boom" });
    expect(result?.stack).toBeUndefined();
    expect(result?.page).toBeUndefined();
  });
});
