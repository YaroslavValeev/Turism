import { describe, expect, it } from "vitest";
import type { Env } from "@mywave/config";
import { isOriginAllowed } from "./security";

const baseEnv: Env = {
  APP_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  JWT_SECRET: "x".repeat(32),
  ADMIN_JWT_SECRET: "y".repeat(32),
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  INGESTION_DAILY_ENABLED: false,
  INGESTION_DAILY_HOUR_LOCAL: 8,
  INGESTION_AUTOPUBLISH_ENABLED: true,
  ANALYTICS_ENABLED: false,
  PUBLIC_WEB_BASE_URL: "https://mywavetour.ru",
  PUBLIC_API_BASE_URL: "https://api.mywavetour.ru",
  ANALYTICS_ALERT_COOLDOWN_SECONDS: 3600,
  ANALYTICS_OPS_SCHEDULER_ENABLED: false,
  ANALYTICS_OPS_INTERVAL_MS: 3_600_000,
  SCORE_MIN_BOOKINGS_FOR_BAND: 2,
  SCORE_MIN_VIEWS_FOR_PROGRAM_PERF: 8,
  ANALYTICS_DQ_EVENT_BASELINE: 5,
  ANALYTICS_DQ_INGESTION_ERRORS_WARNING: 10,
  ANALYTICS_DQ_INGESTION_ERRORS_CRITICAL: 50,
  ANALYTICS_DQ_DUPLICATE_WARNING: 20,
  ANALYTICS_DQ_LATE_EVENT_LAG_SEC: 7200,
  ANALYTICS_DQ_MAX_PIPELINE_LAG_SEC: 21600,
  SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED: false,
  PUBLIC_RATE_LIMIT_WINDOW_MS: 60_000,
  PUBLIC_RATE_LIMIT_MAX: 80,
  PILOT_MODE_ENABLED: false,
  AI_ENABLED: false,
  AI_OWNER_APPROVAL_REQUIRED: true,
  AI_AUTOPUBLISH_ENABLED: false,
  CORS_ALLOWED_ORIGINS: "https://mywavetour.ru/programs/, https://www.mywavetour.ru/",
};

describe("isOriginAllowed", () => {
  it("accepts origins normalized from allowlist entries with path/slash", () => {
    expect(isOriginAllowed("https://mywavetour.ru", baseEnv)).toBe(true);
    expect(isOriginAllowed("https://www.mywavetour.ru", baseEnv)).toBe(true);
  });

  it("rejects origin that is not in allowlist", () => {
    expect(isOriginAllowed("https://evil.example", baseEnv)).toBe(false);
  });
});
