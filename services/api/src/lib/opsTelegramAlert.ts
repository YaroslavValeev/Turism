import { getApiEnv } from "../modules/analytics/runtimeEnv";

/** Короткий алерт в ops-чат (TELEGRAM_ALERT_CHAT_ID). Без PII в тексте. */
export function sendOpsTelegramAlertBestEffort(text: string): void {
  const env = getApiEnv();
  const base = env.TELEGRAM_BOT_API_BASE_URL?.trim();
  const chatId = env.TELEGRAM_ALERT_CHAT_ID?.trim();
  if (!base || !chatId) return;
  const url = `${base.replace(/\/+$/, "")}/sendMessage`;
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}
