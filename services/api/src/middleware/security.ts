import rateLimit from "express-rate-limit";
import type { Env } from "@mywave/config";

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter((item): item is string => Boolean(item));
}

export function isOriginAllowed(origin: string | undefined, env: Env): boolean {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  const allowlist = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (allowlist.length === 0) return env.APP_ENV !== "production";
  return allowlist.includes(normalizedOrigin);
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
