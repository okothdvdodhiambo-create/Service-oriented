import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createQrToken, ServiceUnavailableError } from "@service-oriente/shared";
import type { PrismaClient } from "../generated/client/index.js";
import { createApp } from "./app.js";
import type { RegistryDocument } from "./types.js";

const qrSecret = "q".repeat(40);
const pepper = "p".repeat(40);
const apiKey = "demo-key-for-tests";

function fakePrisma(options: { approved?: boolean } = {}): PrismaClient {
  const transaction = {
    verificationLog: { create: vi.fn().mockResolvedValue({}) },
    dailyStat: { upsert: vi.fn().mockResolvedValue({}) }
  };
  return {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    institution: {
      findUnique: vi.fn().mockResolvedValue(options.approved ? {
        id: "institution-1",
        apiKeyHash: createHash("sha256").update(apiKey).digest("hex"),
        status: "APPROVED"
      } : null)
    },
    verificationLog: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null)
    }
  } as unknown as PrismaClient;
}

const document: RegistryDocument = {
  id: "opaque-document-id",
  documentType: "CERTIFICATE",
  documentNumber: "PRIVATE-NUMBER-93271",
  holderName: "Jane Otieno",
  issuedByName: "Example College",
  issueDate: "2025-01-01T00:00:00.000Z",
  expiryDate: null,
  status: "ACTIVE",
  statusChangedAt: "2025-01-01T00:00:00.000Z",
  issueYear: 2025
};

beforeEach(() => {
  process.env.QR_SECRET = qrSecret;
  process.env.SERVER_PEPPER = pepper;
  process.env.INTERNAL_EVENT_SECRET = "e".repeat(40);
  delete process.env.EVENT_BUS_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verification API", () => {
  it("limits the public QR response to privacy-safe fields", async () => {
    const app = createApp({
      prisma: fakePrisma(),
      qrLookup: vi.fn().mockResolvedValue({ document })
    });
    const token = createQrToken(document.id, qrSecret);
    const response = await request(app).get(`/verify/public/${encodeURIComponent(token)}`).expect(200);
    expect(response.body.result).toBe("GENUINE");
    expect(response.body.maskedHolderName).toBe("J*** O*****");
    expect(JSON.stringify(response.body)).not.toContain(document.documentNumber);
    for (const field of ["documentNumber", "dateOfBirth", "id", "documentId", "verificationId"]) {
      expect(response.body).not.toHaveProperty(field);
    }
  });

  it("returns a generic invalid-token result and never looks up a tampered QR", async () => {
    const qrLookup = vi.fn();
    const app = createApp({ prisma: fakePrisma(), qrLookup });
    const token = createQrToken(document.id, qrSecret);
    const [payload, signature] = token.split(".");
    const changedSignature = signature?.[0] === "A"
      ? `B${signature.slice(1)}`
      : `A${signature?.slice(1)}`;
    const response = await request(app).get(`/verify/public/${payload}.${changedSignature}`).expect(200);
    expect(response.body.result).toBe("INVALID_TOKEN");
    expect(response.body).not.toHaveProperty("documentId");
    expect(qrLookup).not.toHaveBeenCalled();
  });

  it("serves the OpenAPI contract as JSON", async () => {
    const response = await request(createApp({ prisma: fakePrisma() })).get("/openapi.json").expect(200);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths["/verify/public/{qrToken}"]).toBeDefined();
  });

  it("enforces 30 public requests per minute and includes Retry-After", async () => {
    const app = createApp({ prisma: fakePrisma(), qrLookup: vi.fn().mockResolvedValue({ document }) });
    const token = createQrToken(document.id, qrSecret);
    for (let count = 0; count < 30; count += 1) {
      await request(app).get(`/verify/public/${token}`).expect(200);
    }
    const limited = await request(app).get(`/verify/public/${token}`).expect(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("rejects anonymous number checks, accepts an approved API key, and maps registry outage to 503", async () => {
    const prisma = fakePrisma({ approved: true });
    const app = createApp({
      prisma,
      numberLookup: vi.fn().mockResolvedValue({ document })
    });
    await request(app).post("/verify/number")
      .send({ documentType: "CERTIFICATE", documentNumber: document.documentNumber }).expect(401);
    const successful = await request(app).post("/verify/number")
      .set("x-api-key", apiKey)
      .send({ documentType: "CERTIFICATE", documentNumber: document.documentNumber })
      .expect(200);
    expect(successful.body.result).toBe("GENUINE");
    expect(successful.body.maskedNumber).not.toBe(document.documentNumber);

    const unavailable = createApp({
      prisma,
      numberLookup: vi.fn().mockRejectedValue(new ServiceUnavailableError("registry"))
    });
    const failed = await request(unavailable).post("/verify/number")
      .set("x-api-key", apiKey)
      .send({ documentType: "CERTIFICATE", documentNumber: document.documentNumber })
      .expect(503);
    expect(failed.body.error).toBe("SERVICE_UNAVAILABLE");
    expect(failed.body.error).not.toBe("NOT_FOUND");
  });

  it("rejects a suspended institution API key and scopes history to its institution", async () => {
    const suspended = createApp({ prisma: fakePrisma() });
    await request(suspended).post("/verify/number")
      .set("x-api-key", apiKey)
      .send({ documentType: "CERTIFICATE", documentNumber: "CERT-1" })
      .expect(401);

    const prisma = fakePrisma({ approved: true });
    const app = createApp({ prisma });
    await request(app).get("/verify/history").set("x-api-key", apiKey).expect(200);
    expect(prisma.verificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ institutionId: "institution-1" }) })
    );
  });
});
