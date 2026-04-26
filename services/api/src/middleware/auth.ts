/**
 * Admin-only auth. JWT with ADMIN_JWT_SECRET. No public auth in Sprint 1.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Env } from "@mywave/config";

export interface AdminPayload {
  sub: string;
  role: "admin" | "organizer" | "user";
}

declare global {
  namespace Express {
    interface Request {
      adminUserId?: string;
    }
  }
}

export function requireAdmin(env: Env) {
  return requireRole(env, ["admin"]);
}

export function requireRole(env: Env, roles: Array<AdminPayload["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Unauthorized", code: "MISSING_TOKEN" });
      return;
    }
    try {
      const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminPayload;
      if (!roles.includes(payload.role)) {
        res.status(403).json({ error: "Forbidden", code: "NOT_ADMIN" });
        return;
      }
      req.adminUserId = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized", code: "INVALID_TOKEN" });
    }
  };
}
