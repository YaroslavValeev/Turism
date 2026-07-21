import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("ingestion env safety defaults", () => {
  const backup = { ...process.env };

  beforeEach(() => {
    process.env = {
      APP_ENV: "test",
      DATABASE_URL: "postgresql://user:password@localhost:5432/test",
      JWT_SECRET: "test-jwt-secret",
      ADMIN_JWT_SECRET: "test-admin-jwt-secret",
    };
  });

  afterEach(() => {
    process.env = { ...backup };
  });

  it("disables ingestion autopublish and limits daily sources by default", () => {
    const env = loadEnv();

    expect(env.INGESTION_AUTOPUBLISH_ENABLED).toBe(false);
    expect(env.INGESTION_DAILY_SOURCE_LIMIT).toBe(5);
  });

  it.each(["0", "101", "1.5", "invalid"])("rejects invalid daily source limit %s", (value) => {
    process.env.INGESTION_DAILY_SOURCE_LIMIT = value;

    expect(() => loadEnv()).toThrow(/INGESTION_DAILY_SOURCE_LIMIT/);
  });
});
