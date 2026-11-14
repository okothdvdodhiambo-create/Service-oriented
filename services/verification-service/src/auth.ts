import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "../generated/client/index.js";
import type { AuthContext } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function equalHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAuth(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.header("x-api-key");
    if (apiKey) {
      const presentedHash = createHash("sha256").update(apiKey).digest("hex");
      const institution = await prisma.institution.findUnique({
        where: { apiKeyHash: presentedHash },
        select: { id: true, apiKeyHash: true, status: true }
      });
      if (institution?.status === "APPROVED" && equalHash(institution.apiKeyHash, presentedHash)) {
        req.auth = { callerType: "INSTITUTION", institutionId: institution.id, userId: null };
        next();
        return;
      }
      res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or suspended credentials" });
      return;
    }

    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const jwtSecret = process.env.JWT_SECRET;
    if (token && jwtSecret) {
      try {
        const claims = jwt.verify(token, jwtSecret, { issuer: "service-oriente-auth" }) as jwt.JwtPayload;
        const role = claims.role;
        if (role === "ADMIN") {
          req.auth = { callerType: "ADMIN", institutionId: null, userId: String(claims.sub ?? "") };
          next();
          return;
        }
        if (role === "INSTITUTION" && typeof claims.institutionId === "string") {
          const institution = await prisma.institution.findUnique({
            where: { id: claims.institutionId },
            select: { status: true }
          });
          if (institution?.status === "APPROVED") {
            req.auth = {
              callerType: "INSTITUTION",
              institutionId: claims.institutionId,
              userId: String(claims.sub ?? "")
            };
            next();
            return;
          }
        }
      } catch {
        res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired credentials" });
        return;
      }
    }
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
  };
}

export function requireRoles(...roles: AuthContext["callerType"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.auth && roles.includes(req.auth.callerType)) {
      next();
      return;
    }
    res.status(403).json({ error: "FORBIDDEN", message: "You are not allowed to perform this operation" });
  };
}
