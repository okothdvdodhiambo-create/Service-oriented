import { timingSafeEqual, scryptSync } from "node:crypto";
import express, { type Request } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { PrismaClient } from "../../verification-service/generated/client/index.js";
import { FixedWindowLimiter } from "@service-oriente/shared";

const limiter = new FixedWindowLimiter(10, 60_000);
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024)
});

function ipFor(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function verifyPassword(password: string, encoded: string | null): boolean {
  if (!encoded) {
    scryptSync(password, "service-oriente-invalid-user", 64);
    return false;
  }
  const [salt, digest, extra] = encoded.split(":");
  if (!salt || !digest || extra || !/^[a-f0-9]{128}$/i.test(digest)) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createAuthApp(prisma: PrismaClient) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1);
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/auth/login", async (req, res) => {
    const limit = limiter.consume(ipFor(req));
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json({ error: "RATE_LIMITED", message: "Too many sign-in attempts" });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "Email and password are required" });
      return;
    }
    const user = await prisma.authUser.findUnique({
      where: { email: parsed.data.email.trim().toLowerCase() },
      include: { institution: { select: { status: true } } }
    });
    const configured = verifyPassword(parsed.data.password, user?.passwordHash ?? null);
    const active = user?.role === "ADMIN" ||
      (user?.role === "INSTITUTION" && user.institution?.status === "APPROVED");
    if (!user || !configured || !active) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid email or password" });
      return;
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET must be configured");
    const accessToken = jwt.sign(
      { role: user.role, institutionId: user.institutionId },
      secret,
      { subject: user.id, expiresIn: "15m", issuer: "service-oriente-auth" }
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({ accessToken, tokenType: "Bearer", expiresIn: 900, role: user.role });
  });
  app.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Authentication request failed", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  });
  return app;
}
