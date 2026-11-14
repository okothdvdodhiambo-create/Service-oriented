import { describe, expect, it } from "vitest";
import { mapResult, publicResult } from "./mapping.js";

describe("verification result mapping", () => {
  it.each([
    ["ACTIVE", "GENUINE"],
    ["LOST", "REPORTED_LOST"],
    ["REVOKED", "REVOKED"],
    ["REPLACED", "REPLACED"],
    ["EXPIRED", "EXPIRED"]
  ] as const)("maps %s", (status, expected) => {
    expect(mapResult(status)).toBe(expected);
  });

  it("keeps public response free of identifying fields", () => {
    const response = publicResult({
      id: "internal-id",
      documentType: "CERTIFICATE",
      documentNumber: "NO-123456",
      holderName: "Jane Otieno",
      issuedByName: "College",
      issueDate: "2020-01-01",
      expiryDate: null,
      status: "ACTIVE",
      statusChangedAt: null
    });
    expect(response).not.toHaveProperty("documentNumber");
    expect(response).not.toHaveProperty("id");
    expect(response).not.toHaveProperty("holderName");
    expect(JSON.stringify(response)).not.toContain("NO-123456");
  });
});
