import { Request, Response, NextFunction } from "express";
import type { Env } from "@mywave/config";

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const headerToken = req.headers["x-internal-analytics-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) return headerToken;
  return null;
}

export function requireInternalAnalyticsToken(env: Env) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!env.INTERNAL_ANALYTICS_TOKEN) {
      res.status(503).json({ error: "Analytics internal token is not configured", code: "MISSING_INTERNAL_TOKEN" });
      return;
    }
    const token = extractBearer(req);
    if (!token || token !== env.INTERNAL_ANALYTICS_TOKEN) {
      res.status(401).json({ error: "Unauthorized", code: "INVALID_INTERNAL_TOKEN" });
      return;
    }
    next();
  };
}
