import { describe, expect, it } from "vitest";
import { isCurrentQrToken } from "./qrTokens.js";

describe("stored QR token matching", () => {
  it("accepts only the currently stored token", () => {
    expect(isCurrentQrToken("current.token", "current.token")).toBe(true);
    expect(isCurrentQrToken("new.token", "old.token")).toBe(false);
    expect(isCurrentQrToken(null, "old.token")).toBe(false);
  });
});
