import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { createQrToken, sha256, verifyQrToken } from "@service-oriente/shared";
import type { PrismaClient } from "../generated/client/index.js";
import { publishDocumentChanged } from "./events.js";
import { isCurrentQrToken } from "./qrTokens.js";

interface Principal {
  role: "INSTITUTION" | "ADMIN";
  institutionId: string | null;
  userId: string;
}

const createSchema = z.object({
  documentType: z.string().trim().min(1).max(64),
  documentNumber: z.string().trim().min(1).max(128),
  holderName: z.string().trim().min(2).max(200),
  issueDate: z.string().datetime(),
  expiryDate: z.string().datetime().nullable().optional()
});

async function getPrincipal(req: Request, prisma: PrismaClient): Promise<Principal | null> {
  const key = req.header("x-api-key");
  if (key) {
    const keyHash = createHash("sha256").update(key).digest("hex");
    const institution = await prisma.institution.findUnique({
      where: { apiKeyHash: keyHash },
      select: { id: true, apiKeyHash: true, status: true }
    });
    const presented = Buffer.from(keyHash, "hex");
    const saved = institution ? Buffer.from(institution.apiKeyHash, "hex") : Buffer.alloc(0);
    if (institution?.status === "APPROVED" && presented.length === saved.length &&
        timingSafeEqual(presented, saved)) {
      return { role: "INSTITUTION", institutionId: institution.id, userId: institution.id };
    }
    return null;
  }
  const token = req.header("authorization")?.replace(/^Bearer /, "");
  const jwtSecret = process.env.JWT_SECRET;
  if (!token || !jwtSecret) return null;
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, jwtSecret, { issuer: "service-oriente-auth" }) as jwt.JwtPayload;
  } catch {
    return null;
  }
  if (claims.role === "ADMIN") return { role: "ADMIN", institutionId: null, userId: String(claims.sub ?? "") };
  if (claims.role === "INSTITUTION" && typeof claims.institutionId === "string") {
    const institution = await prisma.institution.findUnique({
      where: { id: claims.institutionId },
      select: { status: true }
    });
    if (institution?.status !== "APPROVED") return null;
    return { role: "INSTITUTION", institutionId: claims.institutionId, userId: String(claims.sub ?? "") };
  }
  return null;
}

function requireInternal(req: Request, res: Response): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const actual = req.header("x-internal-service-token");
  const expectedBytes = expected ? Buffer.from(expected) : Buffer.alloc(0);
  const actualBytes = actual ? Buffer.from(actual) : Buffer.alloc(0);
  if (!expected || !actual || expectedBytes.length !== actualBytes.length ||
      !timingSafeEqual(expectedBytes, actualBytes)) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return false;
  }
  return true;
}

function documentView(document: {
  id: string;
  documentType: string;
  documentNumber: string;
  holderName: string;
  issueDate: Date;
  expiryDate: Date | null;
  status: string;
  statusChangedAt: Date;
  issuedBy: { name: string };
}) {
  const expired = document.status === "ACTIVE" && document.expiryDate !== null &&
    document.expiryDate.getTime() <= Date.now();
  return {
    id: document.id,
    documentType: document.documentType,
    documentNumber: document.documentNumber,
    holderName: document.holderName,
    issuedByName: document.issuedBy.name,
    issueDate: document.issueDate.toISOString(),
    expiryDate: document.expiryDate?.toISOString() ?? null,
    status: expired ? "EXPIRED" : document.status,
    statusChangedAt: (expired ? document.expiryDate! : document.statusChangedAt).toISOString(),
    issueYear: document.issueDate.getUTCFullYear()
  };
}

export function createRegistryApp(prisma: PrismaClient) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ready" }); }
    catch { res.status(503).json({ status: "not_ready" }); }
  });

  app.post("/internal/documents/lookup", async (req, res) => {
    if (!requireInternal(req, res)) return;
    const parsed = z.object({ documentType: z.string(), documentNumber: z.string() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
    const document = await prisma.document.findUnique({
      where: { documentType_documentNumber: parsed.data },
      include: { issuedBy: { select: { name: true } } }
    });
    res.json({ document: document ? documentView(document) : null });
  });

  app.post("/internal/documents/lookup-by-qr", async (req, res) => {
    if (!requireInternal(req, res)) return;
    const parsed = z.object({ qrToken: z.string().min(1).max(2048) }).safeParse(req.body);
    if (!parsed.success) { res.json({ document: null, invalidToken: true }); return; }
    const verified = verifyQrToken(parsed.data.qrToken, process.env.QR_SECRET);
    if (!verified) { res.json({ document: null, invalidToken: true }); return; }
    const document = await prisma.document.findUnique({
      where: { id: verified.documentId },
      include: { issuedBy: { select: { name: true } } }
    });
    if (!document || !isCurrentQrToken(document.qrToken, parsed.data.qrToken)) {
      res.json({ document: null, invalidToken: true });
      return;
    }
    res.json({ document: documentView(document), invalidToken: false });
  });

  app.post("/documents", async (req, res) => {
    const principal = await getPrincipal(req, prisma);
    if (!principal) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
    if (principal.role === "INSTITUTION" && !principal.institutionId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    const issuedById = principal.institutionId ?? req.body.issuedById;
    if (principal.role === "ADMIN" && typeof issuedById !== "string") {
      res.status(400).json({ error: "ISSUER_REQUIRED" });
      return;
    }
    const id = randomUUID();
    const qrToken = createQrToken(id, process.env.QR_SECRET);
    const document = await prisma.document.create({
      data: {
        id,
        documentType: parsed.data.documentType,
        documentNumber: parsed.data.documentNumber,
        holderName: parsed.data.holderName,
        issuedById,
        issueDate: new Date(parsed.data.issueDate),
        expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        qrToken
      },
      select: { id: true, qrToken: true }
    });
    res.status(201).json(document);
  });

  app.post("/documents/:id/qr/rotate", async (req, res) => {
    const principal = await getPrincipal(req, prisma);
    if (!principal) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { id: true, issuedById: true, qrToken: true, documentType: true, documentNumber: true }
    });
    if (!document) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    if (principal.role !== "ADMIN" && document.issuedById !== principal.institutionId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    const qrToken = createQrToken(document.id, process.env.QR_SECRET);
    await prisma.$transaction([
      prisma.document.update({ where: { id: document.id }, data: { qrToken } }),
      prisma.documentHistory.create({
        data: {
          documentId: document.id,
          eventType: "QR_ROTATED",
          previousTokenHash: document.qrToken ? sha256(document.qrToken) : null,
          changedBy: principal.userId || principal.institutionId || "admin"
        }
      })
    ]);
    await publishDocumentChanged(document, "document.qr_rotated");
    res.json({ qrToken });
  });

  app.patch("/documents/:id/status", async (req, res) => {
    const principal = await getPrincipal(req, prisma);
    if (!principal) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }
    const parsed = z.object({ status: z.enum(["ACTIVE", "LOST", "REVOKED", "REPLACED", "EXPIRED"]) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "INVALID_STATUS" }); return; }
    const current = await prisma.document.findUnique({ where: { id: req.params.id },     select: { id: true, issuedById: true, documentType: true, documentNumber: true } });
    if (!current) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    if (principal.role !== "ADMIN" && current.issuedById !== principal.institutionId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    const updated = await prisma.document.update({
      where: { id: current.id },
      data: { status: parsed.data.status, statusChangedAt: new Date() },
      select: { id: true, status: true, statusChangedAt: true }
    });
    await publishDocumentChanged(current);
    res.json(updated);
  });

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error("Document registry request failed", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  });
  return app;
}
