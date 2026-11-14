import { describe, expect, it } from "vitest";
import { FixedWindowLimiter } from "@service-oriente/shared";
import { FailureSlowdown, SuspiciousActivityDetector } from "./limiter.js";

describe("rate limiting", () => {
  it("returns a retry delay after the fixed window limit", () => {
    const limiter = new FixedWindowLimiter(1, 60_000);
    expect(limiter.consume("ip", 1_000).allowed).toBe(true);
    expect(limiter.consume("ip", 2_000)).toEqual({ allowed: false, retryAfterSeconds: 59 });
  });

  it("slows repeated not-found/invalid results", () => {
    const slowdown = new FailureSlowdown();
    for (let i = 0; i < 10; i += 1) slowdown.recordFailure("ip", 1_000 + i);
    expect(slowdown.check("ip", 1_010).allowed).toBe(false);
    expect(slowdown.check("ip", 6_010).allowed).toBe(true);
  });

  it("detects repeated failures within a short window", () => {
    const detector = new SuspiciousActivityDetector(3, 10_000);
    expect(detector.observe("ip:hash", 0)).toBe(false);
    expect(detector.observe("ip:hash", 1)).toBe(false);
    expect(detector.observe("ip:hash", 2)).toBe(true);
    expect(detector.observe("other-ip", 2)).toBe(false);
    expect(detector.observe("ip:hash", 10_003)).toBe(false);
  });
});
