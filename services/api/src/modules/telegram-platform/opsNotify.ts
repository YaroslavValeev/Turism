import type { Env } from "@mywave/config";
import { callTelegramJson } from "../telegram/telegramApi";

export function resolveOpsAlertChatId(env: Env): string | null {
  return (
    env.TELEGRAM_ALERT_CHAT_ID?.trim() ||
    env.TELEGRAM_CHANNEL_CHAT_ID?.trim() ||
    process.env.TELEGRAM_CHANNEL_CHAT_ID?.trim() ||
    null
  );
}

export async function notifyLeadMissingContactToOps(
  env: Env,
  args: {
    leadToken: string;
    programTitle: string;
    organizerName: string;
    organizerId: string;
    bookingId: string;
  }
): Promise<{ ok: boolean }> {
  const chat = resolveOpsAlertChatId(env);
  if (!chat || !env.TELEGRAM_BOT_API_BASE_URL) {
    return { ok: false };
  }

  const text = `⚠️ Заявка требует ручной обработки

Причина: у организатора не указан Telegram contact channel.

Lead: ${args.leadToken}
Программа: ${args.programTitle}
Организатор: ${args.organizerName}
Источник: Telegram deep-link / bot
Статус: organizer_telegram_channel_missing

Действия:
1. Связаться с организатором вручную.
2. Получить Telegram chat ID / username.
3. Заполнить OrganizerContactChannel.
4. Повторить отправку или отметить как contacted manually.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "Взял в работу", callback_data: `O|ops_work|${args.leadToken}` },
        { text: "Связался вручную", callback_data: `O|ops_contacted|${args.leadToken}` },
      ],
      [
        { text: "Запросить контакт", callback_data: `O|ops_request_contact|${args.leadToken}` },
        { text: "Нет контакта", callback_data: `O|ops_blocked|${args.leadToken}` },
      ],
    ],
  };

  const res = await callTelegramJson(env, "sendMessage", {
    chat_id: chat,
    text: text.slice(0, 4000),
    reply_markup: keyboard,
  });
  return { ok: res.ok };
}
