import axios from "axios";
import { buildTelegramBotApiUrl } from "./telegramApiUrl.js";

function resolveToken(): string {
  return process.env.TG_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
}

export type TelegramInboundMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramInboundMessage;
};

/**
 * Long-polling getUpdates (timeout до 50 с по документации Telegram).
 */
export async function fetchTelegramUpdates(offset: number): Promise<TelegramUpdate[]> {
  const botToken = resolveToken();
  if (!botToken) {
    throw new Error("Нужен TG_BOT_TOKEN или TELEGRAM_BOT_TOKEN для getUpdates");
  }
  const url = buildTelegramBotApiUrl(botToken, "getUpdates");
  const res = await axios.get<{ ok: boolean; result?: TelegramUpdate[] }>(url, {
    params: { offset, timeout: 50, allowed_updates: JSON.stringify(["message"]) },
    timeout: 55_000,
  });
  if (!res.data?.ok) return [];
  return res.data.result ?? [];
}
