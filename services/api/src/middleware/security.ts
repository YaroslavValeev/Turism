import rateLimit from "express-rate-limit";
import type { Env } from "@mywave/config";

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined, env: Env): boolean {
  if (!origin) return true;
  const allowlist = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (allowlist.length === 0) return env.APP_ENV !== "production";
  return allowlist.includes(origin);
}

export function createPublicRateLimiter(env: Env) {
  return rateLimit({
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    limit: env.PUBLIC_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  });
}
