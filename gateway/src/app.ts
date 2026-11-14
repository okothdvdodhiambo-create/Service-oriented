import express, { type Request, type Response } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { FixedWindowLimiter } from "@service-oriente/shared";

type Role = "INSTITUTION" | "ADMIN";
interface Principal {
  role: Role;
  key: string;
}

function principalFor(req: Request): Principal | null {
  const apiKey = req.header("x-api-key");
  if (apiKey) return { role: "INSTITUTION", key: `key:${apiKey}` };
  const token = req.header("authorization")?.replace(/^Bearer /, "");
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return null;
  try {
    const claims = jwt.verify(token, secret, { issuer: "service-oriente-auth" }) as jwt.JwtPayload;
    if (claims.role === "ADMIN") return { role: "ADMIN", key: `user:${claims.sub ?? "admin"}` };
    if (claims.role === "INSTITUTION") return { role: "INSTITUTION", key: `user:${claims.sub ?? "institution"}` };
  } catch {
    return null;
  }
  return null;
}

function requiresInstitution(req: Request): boolean {
  const path = req.path;
  if (path === "/verify/number" || path === "/verify/qr" || path === "/verify/batch" ||
      path === "/verify/history" || /^\/verify\/[^/]+\/receipt$/.test(path)) return true;
  if (path === "/verify/stats/mine") return true;
  return false;
}

function requiresAdmin(req: Request): boolean {
  return req.path === "/verify/stats";
}

function institutionOnly(req: Request): boolean {
  return req.path === "/verify/batch" || req.path === "/verify/stats/mine";
}

function allowedMethod(req: Request): boolean {
  const path = req.path;
  if (path === "/verify/public" || path.startsWith("/verify/public/")) return req.method === "GET";
  if (path === "/verify/number") return req.method === "GET" || req.method === "POST";
  if (["/verify/qr", "/verify/batch"].includes(path)) return req.method === "POST";
  if (["/verify/history", "/verify/stats", "/verify/stats/mine"].includes(path)) return req.method === "GET";
  if (/^\/verify\/[^/]+\/receipt$/.test(path)) return req.method === "GET";
  return false;
}

export function createGatewayApp() {
  const app = express();
  const publicLimiter = new FixedWindowLimiter(30, 60_000);
  const institutionLimiter = new FixedWindowLimiter(300, 60_000);
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
    .split(",").map((origin) => origin.trim());

  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 0);
  app.use((req, res, next) => {
    if (req.path === "/internal" || req.path.startsWith("/internal/")) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "x-api-key", "x-correlation-id"]
  }));
  app.use(express.json({ limit: "256kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/v1", async (req, res) => {
    const targetPath = req.path;
    if (req.method === "GET" && ["/docs", "/openapi.json"].includes(targetPath)) {
      const baseUrl = process.env.VERIFICATION_SERVICE_URL ?? "http://verification-service:3000";
      try {
        const upstream = await fetch(new URL(targetPath, baseUrl), { signal: AbortSignal.timeout(5_000) });
        res.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json")
          .send(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
      }
      return;
    }
    if (targetPath.startsWith("/auth/")) {
      if (req.method !== "POST" || targetPath !== "/auth/login") {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      const baseUrl = process.env.AUTH_SERVICE_URL ?? "http://auth-service:3000";
      try {
        const upstream = await fetch(new URL(targetPath, baseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(5_000)
        });
        res.status(upstream.status).type("application/json").send(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
      }
      return;
    }
    const publicRoute = req.method === "GET" && /^\/verify\/public\/[^/]+$/.test(targetPath);
    if (!targetPath.startsWith("/verify/") || targetPath === "/verify/public" || !allowedMethod(req)) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    if (!publicRoute) {
      const principal = principalFor(req);
      if (!principal) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      if (requiresAdmin(req) && principal.role !== "ADMIN") {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      if (institutionOnly(req) && principal.role !== "INSTITUTION") {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      if (requiresInstitution(req) && principal.role !== "INSTITUTION" && principal.role !== "ADMIN") {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      if (targetPath.startsWith("/verify/public/")) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      const key = req.header("x-api-key") || principal.key;
      const limit = institutionLimiter.consume(key);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        res.status(429).json({ error: "RATE_LIMITED" });
        return;
      }
    } else {
      const limit = publicLimiter.consume(req.ip || "unknown");
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        res.status(429).json({ error: "RATE_LIMITED" });
        return;
      }
    }

    const baseUrl = process.env.VERIFICATION_SERVICE_URL ?? "http://verification-service:3000";
    const url = new URL(targetPath + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""), baseUrl);
    const headers = new Headers();
    for (const header of ["authorization", "x-api-key", "x-correlation-id", "content-type", "user-agent"]) {
      const value = req.header(header);
      if (value) headers.set(header, value);
    }
    headers.set("x-forwarded-for", req.ip || req.socket.remoteAddress || "");
    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers,
        ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: JSON.stringify(req.body) }),
        signal: AbortSignal.timeout(5_000)
      });
      res.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (["content-type", "retry-after", "x-correlation-id", "cache-control"].includes(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.send(body);
    } catch {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Verification is temporarily unavailable" });
    }
  });
  return app;
}
