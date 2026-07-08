import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Env } from "@mywave/config";
import type { AdminPayload } from "../../middleware/auth";

function bearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  return token || null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isCampApiAuthorized(req: Request, env: Env): boolean {
  const token = bearerToken(req);
  if (!token) return false;

  if (env.CAMP_API_TOKEN) {
    return constantTimeEqual(token, env.CAMP_API_TOKEN);
  }

  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminPayload;
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function requireCampApiAuth(env: Env) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isCampApiAuthorized(req, env)) {
      next();
      return;
    }
    res.status(401).json({
      error: "Unauthorized",
      code: env.CAMP_API_TOKEN ? "INVALID_CAMP_API_TOKEN" : "INVALID_ADMIN_TOKEN",
    });
  };
}
