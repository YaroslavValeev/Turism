import { describe, expect, it } from "vitest";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { Env } from "@mywave/config";
import { isCampApiAuthorized } from "./auth";

const baseEnv = {
  ADMIN_JWT_SECRET: "admin-secret",
} as Env;

function req(token: string | null): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
}

describe("camp API auth", () => {
  it("accepts configured CAMP_API_TOKEN", () => {
    expect(isCampApiAuthorized(req("camp-token"), { ...baseEnv, CAMP_API_TOKEN: "camp-token" })).toBe(true);
    expect(isCampApiAuthorized(req("wrong"), { ...baseEnv, CAMP_API_TOKEN: "camp-token" })).toBe(false);
  });

  it("falls back to admin JWT only when CAMP_API_TOKEN is not configured", () => {
    const adminJwt = jwt.sign({ sub: "admin", role: "admin" }, baseEnv.ADMIN_JWT_SECRET);
    expect(isCampApiAuthorized(req(adminJwt), baseEnv)).toBe(true);
    expect(isCampApiAuthorized(req(adminJwt), { ...baseEnv, CAMP_API_TOKEN: "camp-token" })).toBe(false);
  });
});
