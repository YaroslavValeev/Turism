import crypto from "crypto";

/**
 * Проверка Telegram Web App initData (Bot API).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramWebAppInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;

  const entries: [string, string][] = [];
  params.forEach((value, key) => {
    if (key !== "hash") entries.push([key, value]);
  });
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return calculated === hash;
}

export function parseWebAppUser(initData: string): { id: number; username?: string } | null {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as { id: number; username?: string };
    if (typeof user.id !== "number") return null;
    return user;
  } catch {
    return null;
  }
}
