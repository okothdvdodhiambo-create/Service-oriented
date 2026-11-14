import { describe, expect, it } from "vitest";
import { createQrToken, verifyQrToken } from "./crypto.js";

const secret = "a".repeat(32);

describe("QR tokens", () => {
  it("round-trips an opaque document ID and nonce", () => {
    const token = createQrToken("doc_123", secret);
    const verified = verifyQrToken(token, secret);
    expect(verified?.documentId).toBe("doc_123");
    expect(verified?.nonce).toHaveLength(22);
  });

  it("rejects a tampered signature, truncation, and a wrong secret", () => {
    const token = createQrToken("doc_123", secret);
    const [payload, signature] = token.split(".");
    const changedSignature = signature?.[0] === "A"
      ? `B${signature.slice(1)}`
      : `A${signature?.slice(1)}`;
    expect(verifyQrToken(`${payload}.${changedSignature}`, secret)).toBeNull();
    expect(verifyQrToken(payload ?? "", secret)).toBeNull();
    expect(verifyQrToken(token, "b".repeat(32))).toBeNull();
  });

  it("contains no document number or type", () => {
    const token = createQrToken("internal-document-id", secret);
    expect(token).not.toContain("CERTIFICATE-983421");
    expect(token).not.toContain("BIRTH_CERTIFICATE");
    expect(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"))
      .toContain("internal-document-id");
  });
});
