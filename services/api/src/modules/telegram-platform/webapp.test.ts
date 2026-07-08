import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { validateTelegramWebAppInitData } from "./webapp";

function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("validateTelegramWebAppInitData", () => {
  it("accepts correctly signed payload", () => {
    const token = "123456:ABC-DEF";
    const initData = signInitData(
      { user: JSON.stringify({ id: 42, first_name: "T" }), auth_date: "1700000000" },
      token
    );
    expect(validateTelegramWebAppInitData(initData, token)).toBe(true);
  });

  it("rejects tampered hash", () => {
    const token = "123456:ABC-DEF";
    const initData = signInitData({ user: '{"id":42}', auth_date: "1" }, token) + "x";
    expect(validateTelegramWebAppInitData(initData, token)).toBe(false);
  });
});
