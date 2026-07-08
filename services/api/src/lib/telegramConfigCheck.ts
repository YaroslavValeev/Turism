import type { Env } from "@mywave/config";

/**
 * Production guardrails для Telegram webhook ingress.
 */
export function assertTelegramConfigForProduction(env: Env): void {
  if (env.APP_ENV !== "production") return;

  const issues: string[] = [];
  const secret = (env.TELEGRAM_WEBHOOK_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    issues.push("TELEGRAM_WEBHOOK_SECRET is required in production");
  }

  if (process.env.TELEGRAM_USE_POLLING === "1") {
    issues.push("TELEGRAM_USE_POLLING=1 is forbidden in production (webhook only)");
  }

  if (!env.TELEGRAM_BOT_API_BASE_URL?.trim()) {
    issues.push("TELEGRAM_BOT_API_BASE_URL is required in production");
  }

  const alertChat = env.TELEGRAM_ALERT_CHAT_ID?.trim();
  if (alertChat && !alertChat.startsWith("-100")) {
    issues.push("TELEGRAM_ALERT_CHAT_ID should be channel/group chat id (expected -100...)");
  }

  if (issues.length > 0) {
    console.error("[config] Telegram production config invalid:");
    for (const m of issues) {
      console.error(`[config] ${m}`);
    }
    process.exit(1);
  }
}
