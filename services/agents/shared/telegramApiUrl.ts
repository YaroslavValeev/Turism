const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export function buildTelegramBotApiUrl(token: string, method: string): string {
  const rawOrigin = process.env.TELEGRAM_API_BASE_URL?.trim() || DEFAULT_TELEGRAM_API_BASE_URL;
  const origin = new URL(rawOrigin);
  if (
    (origin.protocol !== "https:" && origin.protocol !== "http:") ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.pathname !== "/" && origin.pathname !== "")
  ) {
    throw new Error("TELEGRAM_API_BASE_URL must be an http(s) origin without credentials or path");
  }
  return `${origin.origin}/bot${token}/${method.replace(/^\/+/, "")}`;
}
