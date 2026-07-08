import type { Env } from "@mywave/config";
import { callTelegramJson } from "../telegram/telegramApi";

export type TelegramInlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export function resolveTelegramPlatformOpsChatId(env: Env): string | null {
  const e = env as Env & { TELEGRAM_PLATFORM_OPS_IDS?: string; TELEGRAM_CHANNEL_CHAT_ID?: string };
  return e.TELEGRAM_ALERT_CHAT_ID?.trim() || e.TELEGRAM_CHANNEL_CHAT_ID?.trim() || e.TELEGRAM_PLATFORM_OPS_IDS?.split(",")[0]?.trim() || null;
}

export function buildOpsMissingContactKeyboard(leadId: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Взял в работу", callback_data: `mtops:claim:${leadId}` },
        { text: "Связался вручную", callback_data: `mtops:manual_contacted:${leadId}` },
      ],
      [
        { text: "Запросить контакт", callback_data: `mtops:request_contact:${leadId}` },
        { text: "Нет контакта", callback_data: `mtops:no_contact:${leadId}` },
      ],
    ],
  };
}

export async function sendTelegramPlatformOpsMessage(
  env: Env,
  text: string,
  replyMarkup?: TelegramInlineKeyboard,
): Promise<{ ok: true; messageId?: number } | { ok: false; error: string }> {
  const chatId = resolveTelegramPlatformOpsChatId(env);
  if (!chatId) return { ok: false, error: "TELEGRAM_ALERT_CHAT_ID not set" };

  const res = await callTelegramJson<{ message_id: number }>(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  if (!res.ok) return { ok: false, error: res.description ?? "telegram sendMessage failed" };
  return { ok: true, messageId: res.result?.message_id };
}

export async function sendTelegramPlatformOrganizerMessage(
  env: Env,
  organizerChatId: string,
  text: string,
  replyMarkup?: TelegramInlineKeyboard,
): Promise<{ ok: true; messageId?: number } | { ok: false; error: string }> {
  const res = await callTelegramJson<{ message_id: number }>(env, "sendMessage", {
    chat_id: organizerChatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  if (!res.ok) return { ok: false, error: res.description ?? "telegram sendMessage failed" };
  return { ok: true, messageId: res.result?.message_id };
}
