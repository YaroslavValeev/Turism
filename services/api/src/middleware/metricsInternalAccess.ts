import { Request, Response, NextFunction } from "express";
import type { Env } from "@mywave/config";
import { requireAdmin } from "./auth";

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const headerToken = req.headers["x-internal-analytics-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) return headerToken;
  return null;
}

/**
 * Read-only метрики: либо admin JWT, либо тот же `INTERNAL_ANALYTICS_TOKEN`, что и для `POST /internal/analytics/*`.
 * Позволяет cron-агенту ходить в `GET /metrics/content-entries` без выдачи admin JWT.
 */
export function requireAdminOrInternalAnalytics(env: Env) {
  const adminOnly = requireAdmin(env);
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearer(req);
    if (env.INTERNAL_ANALYTICS_TOKEN && token === env.INTERNAL_ANALYTICS_TOKEN) {
      next();
      return;
    }
    adminOnly(req, res, next);
  };
}
