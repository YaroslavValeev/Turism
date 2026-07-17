import axios from "axios";
import { buildTelegramBotApiUrl } from "./telegramApiUrl.js";

function resolveToken(): string {
  return process.env.TG_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
}

function resolveChatId(): string {
  return (
    process.env.TG_CHAT_ID ??
    process.env.TELEGRAM_ANALYTICS_AGENT_CHAT_ID ??
    process.env.TELEGRAM_ALERT_CHAT_ID ??
    process.env.OWNER_CHAT_ID ??
    ""
  );
}

/**
 * Один бот, исходящее сообщение. Лимит 4096 — вызывайте после `splitTelegramMessage`.
 */
export async function sendToTelegram(text: string): Promise<void> {
  const botToken = resolveToken();
  const chatId = resolveChatId();
  if (!botToken || !chatId) {
    throw new Error(
      "Нужны TG_BOT_TOKEN (или TELEGRAM_BOT_TOKEN) и TG_CHAT_ID (или TELEGRAM_ALERT_CHAT_ID / TELEGRAM_ANALYTICS_AGENT_CHAT_ID)"
    );
  }
  const url = buildTelegramBotApiUrl(botToken, "sendMessage");
  await axios.post(
    url,
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    },
    { timeout: 30_000 }
  );
}
