import { describe, expect, it, vi } from "vitest";
import { VerificationCache } from "./cache.js";

describe("VerificationCache", () => {
  it("expires after its TTL and invalidates by document event", () => {
    let now = 0;
    const cache = new VerificationCache(30_000, 10, () => now);
    const entry = {
      response: { result: "GENUINE" as const, documentType: "CERT", issuedByName: "Issuer", checkedAt: "" },
      documentId: "doc-1",
      numberHash: "hash-1"
    };
    cache.set("qr:token", entry);
    expect(cache.get("qr:token")).toEqual(entry);
    cache.invalidateDocument("doc-1");
    expect(cache.get("qr:token")).toBeNull();
    cache.set("number:hash-1", entry);
    now = 30_001;
    expect(cache.get("number:hash-1")).toBeNull();
  });
});
