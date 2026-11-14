import { beforeEach, describe, expect, it } from "vitest";
import { hashDocumentNumber } from "@service-oriente/shared";
import { VerificationCache } from "./cache.js";
import { handleStatusChanged } from "./events.js";

beforeEach(() => {
  process.env.SERVER_PEPPER = "pepper-value-with-at-least-thirty-two-bytes";
});

describe("document cache invalidation events", () => {
  it("invalidates both QR and number keys for a changed document", () => {
    const cache = new VerificationCache();
    const entry = {
      response: { result: "GENUINE" as const, documentType: "CERT", issuedByName: "Issuer", checkedAt: "" },
      documentId: "doc-1",
      numberHash: hashDocumentNumber("CERT-1")
    };
    cache.set("qr:token", entry);
    cache.set("number:CERT:" + entry.numberHash, entry);

    handleStatusChanged(cache, {
      type: "document.status_changed",
      documentId: "doc-1",
      documentNumber: "CERT-1"
    });

    expect(cache.get("qr:token")).toBeNull();
    expect(cache.get(`number:CERT:${entry.numberHash}`)).toBeNull();
  });
});
