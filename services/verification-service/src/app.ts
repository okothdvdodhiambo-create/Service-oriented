import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { FixedWindowLimiter, hashDocumentNumber, hashIpAddress, verifyQrToken } from "@service-oriente/shared";
import type { PrismaClient, VerificationResult } from "../generated/client/index.js";
import { requireAuth, requireRoles } from "./auth.js";
import { VerificationCache } from "./cache.js";
import { handleStatusChanged, publishEvent, type StatusChangedEvent } from "./events.js";
import { enqueueLog } from "./logging.js";
import { fullResult, publicResult } from "./mapping.js";
import { escapeHtml, maskDocumentNumber } from "./masking.js";
import { FailureSlowdown, SuspiciousActivityDetector } from "./limiter.js";
import { lookupByNumber, lookupByQr } from "./registry.js";
import type { AuthContext, RegistryDocument, VerificationResponse } from "./types.js";

interface AppOptions {
  prisma: PrismaClient;
  cache?: VerificationCache;
  numberLookup?: typeof lookupByNumber;
  qrLookup?: typeof lookupByQr;
}

const numberSchema = z.object({
  documentType: z.string().trim().min(1).max(64),
  documentNumber: z.string().trim().min(1).max(128)
});
const batchSchema = z.object({
  items: z.array(numberSchema).min(1).max(50)
});
const historyQuerySchema = z.object({
  result: z.enum(["GENUINE", "NOT_FOUND", "REPORTED_LOST", "REVOKED", "REPLACED", "EXPIRED", "INVALID_TOKEN"]).optional(),
  method: z.enum(["NUMBER", "QR"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

function ipFor(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function clientUserAgent(req: Request): string | null {
  return req.header("user-agent")?.slice(0, 256) ?? null;
}

function logCheck(
  options: AppOptions,
  req: Request,
  auth: AuthContext,
  details: {
    method: "NUMBER" | "QR";
    id: string;
    documentType: string | null;
    numberHash: string | null;
    documentId: string | null;
    result: VerificationResult;
    correlationId: string;
    startedAt: number;
    cacheHit: boolean;
  }
): void {
  const pepper = process.env.SERVER_PEPPER;
  enqueueLog(options.prisma, {
    id: details.id,
    callerType: auth.callerType,
    institutionId: auth.institutionId,
    userId: auth.userId,
    method: details.method,
    documentType: details.documentType,
    numberHash: details.numberHash,
    documentId: details.documentId,
    result: details.result,
    ipHash: hashIpAddress(ipFor(req), pepper),
    userAgent: clientUserAgent(req),
    correlationId: details.correlationId,
    latencyMs: Math.max(0, Date.now() - details.startedAt),
    cacheHit: details.cacheHit
  });
}

function resultWithId(
  response: VerificationResponse,
  id: string,
  institutionView: boolean
): VerificationResponse {
  return {
    ...response,
    verificationId: id,
    ...(institutionView && response.maskedNumber === undefined ? { maskedNumber: "••••" } : {})
  };
}

function cacheKeyForNumber(type: string, hash: string): string {
  return `number:${type}:${hash}`;
}

function cacheKeyForQr(token: string): string {
  return `qr:${token}`;
}

export function createApp(options: AppOptions) {
  const app = express();
  const cache = options.cache ?? new VerificationCache(30_000);
  const publicLimiter = new FixedWindowLimiter(30, 60_000);
  const failureSlowdown = new FailureSlowdown();
  const suspiciousActivity = new SuspiciousActivityDetector();
  const recordSuspicious = (req: Request, auth: AuthContext, result: VerificationResult): void => {
    if (result !== "INVALID_TOKEN" && result !== "NOT_FOUND") return;
    const ipHash = hashIpAddress(ipFor(req));
    const byIp = suspiciousActivity.observe(`ip:${ipHash}`);
    const byInstitution = auth.institutionId
      ? suspiciousActivity.observe(`institution:${auth.institutionId}`)
      : false;
    if (byIp || byInstitution) {
      void publishEvent("verification.suspicious", {
        callerType: auth.callerType,
        ...(auth.institutionId ? { institutionId: auth.institutionId } : {}),
        ipHash,
        result
      });
    }
  };

  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1);
  app.use(cors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
      .split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "x-api-key", "x-correlation-id"]
  }));
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    try {
      await options.prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });
  app.get("/openapi.json", (_req, res) => {
    res.json(parseYaml(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")));
  });
  app.get("/docs", (_req, res) => {
    res.type("html").send('<!doctype html><title>Verification API</title><p>OpenAPI: <a href="/api/v1/openapi.json">openapi.json</a></p>');
  });

  app.post("/internal/events/document-status-changed", (req, res) => {
    const expected = process.env.INTERNAL_EVENT_SECRET;
    const actual = req.header("x-internal-event-secret");
    const expectedBytes = expected ? Buffer.from(expected) : Buffer.alloc(0);
    const actualBytes = actual ? Buffer.from(actual) : Buffer.alloc(0);
    if (!expected || !actual || expectedBytes.length !== actualBytes.length ||
        !timingSafeEqual(expectedBytes, actualBytes)) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const body = z.object({
      type: z.enum(["document.status_changed", "document.qr_rotated"]),
      documentId: z.string().min(1),
      documentNumber: z.string().optional(),
      documentType: z.string().optional()
    }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "INVALID_EVENT" });
      return;
    }
    handleStatusChanged(cache, body.data as StatusChangedEvent);
    res.status(204).end();
  });

  const authMiddleware = requireAuth(options.prisma);
  const validateNumber = (req: Request, res: Response): z.infer<typeof numberSchema> | null => {
    const parsed = numberSchema.safeParse(req.method === "GET" ? req.query : req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "A document type and number are required" });
      return null;
    }
    return parsed.data;
  };

  const runLookup = async (
    req: Request,
    res: Response,
    input: z.infer<typeof numberSchema>,
    context: AuthContext
  ): Promise<void> => {
    const correlationId = req.header("x-correlation-id")?.slice(0, 128) || randomUUID();
    const startedAt = Date.now();
    const numberHash = hashDocumentNumber(input.documentNumber, process.env.SERVER_PEPPER);
    const key = cacheKeyForNumber(input.documentType, numberHash);
    const cached = cache.get(key);
    let response: VerificationResponse;
    let documentId: string | null;
    if (cached) {
      response = { ...cached.response, checkedAt: new Date().toISOString() };
      documentId = cached.documentId;
    } else {
      const lookup = await (options.numberLookup ?? lookupByNumber)(input.documentType, input.documentNumber);
      documentId = lookup.document?.id ?? null;
      response = fullResult(lookup.document);
      cache.set(key, { response, documentId, numberHash });
    }

    const verificationId = randomUUID();
    logCheck(options, req, context, {
      method: "NUMBER",
      id: verificationId,
      documentType: input.documentType,
      numberHash,
      documentId,
      result: response.result,
      correlationId,
      startedAt,
      cacheHit: Boolean(cached)
    });
    void publishEvent("verification.performed", {
      result: response.result,
      method: "NUMBER",
      institutionId: context.institutionId,
      correlationId
    });
    recordSuspicious(req, context, response.result);
    res.setHeader("x-correlation-id", correlationId);
    res.json(resultWithId(response, verificationId, true));
  };

  const publicGate = (req: Request, res: Response, next: NextFunction): void => {
    const ip = ipFor(req);
    const failureLimit = failureSlowdown.check(ip);
    if (!failureLimit.allowed) {
      res.setHeader("Retry-After", String(failureLimit.retryAfterSeconds));
      res.status(429).json({ error: "RATE_LIMITED", message: "Please wait before trying again" });
      return;
    }
    const limit = publicLimiter.consume(ip);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json({ error: "RATE_LIMITED", message: "Too many verification requests" });
      return;
    }
    next();
  };

  app.get("/verify/public/:qrToken", publicGate, async (req, res) => {
    const token = typeof req.params.qrToken === "string" ? req.params.qrToken : "";
    const correlationId = req.header("x-correlation-id")?.slice(0, 128) || randomUUID();
    const startedAt = Date.now();
    const ip = ipFor(req);
    const auth: AuthContext = { callerType: "PUBLIC", institutionId: null, userId: null };
    const verified = verifyQrToken(token, process.env.QR_SECRET);
    let response: VerificationResponse;
    let documentId: string | null = verified?.documentId ?? null;
    let cacheHit = false;
    if (!verified) {
      response = {
        result: "INVALID_TOKEN",
        documentType: null,
        issuedByName: null,
        issueYear: null,
        checkedAt: new Date().toISOString(),
        maskedHolderName: null
      };
    } else {
      const key = cacheKeyForQr(token);
      const cached = cache.get(key);
      if (cached) {
        response = { ...cached.response, checkedAt: new Date().toISOString() };
        documentId = cached.documentId;
        cacheHit = true;
      } else {
        const lookup = await (options.qrLookup ?? lookupByQr)(token);
        documentId = lookup.document?.id ?? null;
        const validStoredToken = lookup.invalidToken !== true;
        response = validStoredToken
          ? publicResult(lookup.document)
          : {
              result: "INVALID_TOKEN",
              documentType: null,
              issuedByName: null,
              issueYear: null,
              checkedAt: new Date().toISOString(),
              maskedHolderName: null
            };
        cache.set(key, { response, documentId });
      }
    }

    logCheck(options, req, auth, {
      method: "QR",
      id: randomUUID(),
      documentType: response.documentType,
      numberHash: null,
      documentId,
      result: response.result,
      correlationId,
      startedAt,
      cacheHit
    });
    if (response.result === "INVALID_TOKEN" || response.result === "NOT_FOUND") {
      failureSlowdown.recordFailure(ip);
    } else {
      failureSlowdown.recordSuccess(ip);
    }
    recordSuspicious(req, auth, response.result);
    void publishEvent("verification.performed", { callerType: "PUBLIC", result: response.result, method: "QR", correlationId });
    res.setHeader("x-correlation-id", correlationId);
    res.json(response);
  });

  app.post("/verify/number", authMiddleware, requireRoles("INSTITUTION", "ADMIN"), async (req, res) => {
    const input = validateNumber(req, res);
    if (input) await runLookup(req, res, input, req.auth!);
  });
  app.get("/verify/number", authMiddleware, requireRoles("INSTITUTION", "ADMIN"), async (req, res) => {
    const input = validateNumber(req, res);
    if (input) await runLookup(req, res, input, req.auth!);
  });

  app.post("/verify/qr", authMiddleware, requireRoles("INSTITUTION", "ADMIN"), async (req, res) => {
    const parsed = z.object({ qrToken: z.string().min(1).max(2048) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "A QR token is required" });
      return;
    }
    const token = parsed.data.qrToken;
    const correlationId = req.header("x-correlation-id")?.slice(0, 128) || randomUUID();
    const startedAt = Date.now();
    const auth = req.auth!;
    const verified = verifyQrToken(token, process.env.QR_SECRET);
    let response: VerificationResponse;
    let documentId = verified?.documentId ?? null;
    const key = cacheKeyForQr(token);
    const cached = verified ? cache.get(key) : null;
    if (!verified) {
      response = { result: "INVALID_TOKEN", documentType: null, issuedByName: null, checkedAt: new Date().toISOString() };
    } else if (cached) {
      response = { ...cached.response, checkedAt: new Date().toISOString() };
      documentId = cached.documentId;
    } else {
      const lookup = await (options.qrLookup ?? lookupByQr)(token);
      documentId = lookup.document?.id ?? null;
      response = lookup.invalidToken
        ? { result: "INVALID_TOKEN", documentType: null, issuedByName: null, checkedAt: new Date().toISOString() }
        : fullResult(lookup.document);
      cache.set(key, { response, documentId });
    }
    const numberHash = null;
    const verificationId = randomUUID();
    logCheck(options, req, auth, {
      method: "QR",
      id: verificationId,
      documentType: response.documentType,
      numberHash,
      documentId,
      result: response.result,
      correlationId,
      startedAt,
      cacheHit: Boolean(cached)
    });
    recordSuspicious(req, auth, response.result);
    void publishEvent("verification.performed", {
      callerType: auth.callerType,
      result: response.result,
      method: "QR",
      correlationId
    });
    res.setHeader("x-correlation-id", correlationId);
    res.json(resultWithId(response, verificationId, true));
  });

  app.post("/verify/batch", authMiddleware, requireRoles("INSTITUTION"), async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "Batch must contain 1 to 50 valid items" });
      return;
    }
    const results = await Promise.all(parsed.data.items.map(async (item) => {
      const correlationId = randomUUID();
      const startedAt = Date.now();
      const numberHash = hashDocumentNumber(item.documentNumber, process.env.SERVER_PEPPER);
      const cacheKey = cacheKeyForNumber(item.documentType, numberHash);
      const cached = cache.get(cacheKey);
      let response: VerificationResponse;
      let documentId: string | null;
      if (cached) {
        response = { ...cached.response, checkedAt: new Date().toISOString() };
        documentId = cached.documentId;
      } else {
        const lookup = await (options.numberLookup ?? lookupByNumber)(item.documentType, item.documentNumber);
        response = fullResult(lookup.document);
        documentId = lookup.document?.id ?? null;
        cache.set(cacheKey, { response, documentId, numberHash });
      }
      const verificationId = randomUUID();
      logCheck(options, req, req.auth!, {
        method: "NUMBER",
        id: verificationId,
        documentType: item.documentType,
        numberHash,
        documentId,
        result: response.result,
        correlationId,
        startedAt,
        cacheHit: Boolean(cached)
      });
      void publishEvent("verification.performed", {
        result: response.result, method: "NUMBER", institutionId: req.auth!.institutionId, correlationId
      });
      recordSuspicious(req, req.auth!, response.result);
      return resultWithId({
        ...response,
        maskedNumber: maskDocumentNumber(item.documentNumber)
      }, verificationId, true);
    }));
    res.json({ results });
  });

  app.get("/verify/history", authMiddleware, async (req, res) => {
    const auth = req.auth!;
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_FILTER", message: "Invalid history filter or pagination value" });
      return;
    }
    if (parsed.data.from && parsed.data.to &&
        new Date(parsed.data.from).getTime() > new Date(parsed.data.to).getTime()) {
      res.status(400).json({ error: "INVALID_FILTER", message: "The start date must be before the end date" });
      return;
    }
    const { page, pageSize } = parsed.data;
    const where = {
      ...(auth.callerType === "INSTITUTION" ? { institutionId: auth.institutionId } : {}),
      ...(parsed.data.result ? { result: parsed.data.result as VerificationResult } : {}),
      ...(parsed.data.method ? { method: parsed.data.method } : {}),
      ...(parsed.data.from || parsed.data.to ? {
        createdAt: {
          ...(parsed.data.from ? { gte: new Date(parsed.data.from) } : {}),
          ...(parsed.data.to ? { lte: new Date(parsed.data.to) } : {})
        }
      } : {})
    };
    const [total, logs] = await Promise.all([
      options.prisma.verificationLog.count({ where }),
      options.prisma.verificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, callerType: true, method: true, documentType: true,
          result: true, correlationId: true, latencyMs: true, cacheHit: true, createdAt: true
        }
      })
    ]);
    res.json({ page, pageSize, total, items: logs.map((log) => ({ ...log, maskedNumber: "••••" })) });
  });

  app.get("/verify/stats/mine", authMiddleware, requireRoles("INSTITUTION"), async (req, res) => {
    const institutionId = req.auth!.institutionId!;
    const [results, methods, dailyRows, aggregate] = await Promise.all([
      options.prisma.verificationLog.groupBy({ by: ["result"], where: { institutionId }, _count: { _all: true } }),
      options.prisma.verificationLog.groupBy({ by: ["method"], where: { institutionId }, _count: { _all: true } }),
      options.prisma.$queryRaw<Array<{ day: Date; result: VerificationResult; method: "NUMBER" | "QR"; count: number }>>`
        SELECT DATE("createdAt") AS day, result, method, COUNT(*)::int AS count
        FROM "VerificationLog"
        WHERE "institutionId" = ${institutionId}
        GROUP BY DATE("createdAt"), result, method
        ORDER BY day DESC
        LIMIT 90
      `,
      options.prisma.verificationLog.aggregate({ where: { institutionId }, _avg: { latencyMs: true } })
    ]);
    res.json({ results, methods, daily: dailyRows, averageLatencyMs: aggregate._avg.latencyMs ?? 0 });
  });

  app.get("/verify/stats", authMiddleware, requireRoles("ADMIN"), async (_req, res) => {
    const [results, methods, callers, daily, topInstitutions, aggregate] = await Promise.all([
      options.prisma.verificationLog.groupBy({ by: ["result"], _count: { _all: true } }),
      options.prisma.verificationLog.groupBy({ by: ["method"], _count: { _all: true } }),
      options.prisma.verificationLog.groupBy({ by: ["callerType"], _count: { _all: true } }),
      options.prisma.dailyStat.findMany({ orderBy: { date: "desc" }, take: 30 }),
      options.prisma.verificationLog.groupBy({
        by: ["institutionId"],
        where: { institutionId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { institutionId: "desc" } },
        take: 10
      }),
      options.prisma.verificationLog.aggregate({ _avg: { latencyMs: true } })
    ]);
    res.json({ results, methods, callers, daily, topInstitutions, averageLatencyMs: aggregate._avg.latencyMs ?? 0 });
  });

  app.get("/verify/:verificationId/receipt", authMiddleware, requireRoles("INSTITUTION", "ADMIN"), async (req, res) => {
    const log = await options.prisma.verificationLog.findFirst({
      where: {
        id: typeof req.params.verificationId === "string" ? req.params.verificationId : "",
        ...(req.auth!.callerType === "INSTITUTION" ? { institutionId: req.auth!.institutionId } : {})
      },
      select: { id: true, result: true, method: true, documentType: true, createdAt: true, numberHash: true }
    });
    if (!log) {
      res.status(404).send("Verification receipt not found");
      return;
    }
    res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Verification receipt</title>
      <h1>Verification receipt</h1><dl><dt>What was checked</dt><dd>${escapeHtml(log.documentType ?? log.method)}</dd>
      <dt>Result</dt><dd>${escapeHtml(log.result)}</dd><dt>Checked</dt><dd>${escapeHtml(log.createdAt.toISOString())}</dd>
      <dt>Verification ID</dt><dd>${escapeHtml(log.id)}</dd><dt>Document reference</dt><dd>${log.numberHash ? "••••" : "QR token"}</dd></dl></html>`);
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof Error && error.name === "ServiceUnavailableError") {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Verification is temporarily unavailable; please retry" });
      return;
    }
    console.error("Verification request failed", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "INTERNAL_ERROR", message: "The request could not be completed" });
  });

  return app;
}

export { type RegistryDocument };
