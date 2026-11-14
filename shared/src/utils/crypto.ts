import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const QR_NONCE_BYTES = 16;

function secret(name: "QR_SECRET" | "SERVER_PEPPER", supplied?: string): Buffer {
  const value = supplied ?? process.env[name];
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error(`${name} must be configured with at least 32 bytes`);
  }
  return Buffer.from(value, "utf8");
}

function qrSignature(payload: Buffer, key: Buffer): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function createQrToken(documentId: string, qrSecret?: string): string {
  if (!documentId || Buffer.byteLength(documentId, "utf8") === 0) {
    throw new Error("documentId is required");
  }

  const payload = Buffer.concat([
    Buffer.from(documentId, "utf8"),
    randomBytes(QR_NONCE_BYTES)
  ]);
  return `${payload.toString("base64url")}.${qrSignature(payload, secret("QR_SECRET", qrSecret)).toString("base64url")}`;
}

export function verifyQrToken(
  token: string,
  qrSecret?: string
): { documentId: string; nonce: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;

  let payload: Buffer;
  let signature: Buffer;
  try {
    payload = Buffer.from(parts[0], "base64url");
    signature = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }
  if (payload.length <= QR_NONCE_BYTES || signature.length !== 32) return null;
  if (payload.toString("base64url") !== parts[0] || signature.toString("base64url") !== parts[1]) return null;

  const expected = qrSignature(payload, secret("QR_SECRET", qrSecret));
  if (!timingSafeEqual(expected, signature)) return null;

  const documentIdBytes = payload.subarray(0, -QR_NONCE_BYTES);
  const documentId = documentIdBytes.toString("utf8");
  if (!documentId || !Buffer.from(documentId, "utf8").equals(documentIdBytes)) return null;

  return {
    documentId,
    nonce: payload.subarray(-QR_NONCE_BYTES).toString("base64url")
  };
}

export function hashDocumentNumber(documentNumber: string, pepper?: string): string {
  const normalized = documentNumber.normalize("NFKC").trim().toUpperCase();
  return createHmac("sha256", secret("SERVER_PEPPER", pepper))
    .update(normalized)
    .digest("hex");
}

export function hashIpAddress(ip: string, pepper?: string): string {
  return createHmac("sha256", secret("SERVER_PEPPER", pepper))
    .update(ip)
    .digest("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
