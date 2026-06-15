import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson } from "../telegram/telegramApi";
import { notifyLeadMissingContactToOps } from "./opsNotify";

async function hasOrganizerTelegramChat(organizerId: string): Promise<boolean> {
  const channel = await prisma.organizerContactChannel.findFirst({
    where: {
      organizerId,
      channelType: "telegram",
      telegramChatId: { not: null },
      isPrimary: true,
    },
    select: { id: true },
  });
  return Boolean(channel);
}

/** Организатору — только после consent и только при наличии реального telegramChatId. */
export async function notifyLeadToOrganizer(
  env: Env,
  args: {
    leadToken: string;
    programTitle: string;
    organizerName: string;
    organizerId: string;
    guestContact: string;
    bookingId: string;
    consentGiven: boolean;
  }
): Promise<{ ok: boolean; routedToOps?: boolean; error?: string }> {
  if (!args.consentGiven) {
    return { ok: false, error: "consent_required" };
  }
  if (!env.TELEGRAM_BOT_API_BASE_URL) {
    return { ok: false, error: "telegram_not_configured" };
  }

  const channel = await prisma.organizerContactChannel.findFirst({
    where: {
      organizerId: args.organizerId,
      channelType: "telegram",
      isPrimary: true,
    },
  });
  const chatId = channel?.telegramChatId?.trim();
  if (!chatId) {
    const ops = await notifyLeadMissingContactToOps(env, {
      leadToken: args.leadToken,
      programTitle: args.programTitle,
      organizerName: args.organizerName,
      organizerId: args.organizerId,
      bookingId: args.bookingId,
    });
    return {
      ok: false,
      routedToOps: ops.ok,
      error: "missing_real_data: organizer_telegram_channel_missing",
    };
  }

  const text = `Новая заявка MyWave Tour
Программа: ${args.programTitle}
Организатор: ${args.organizerName}
Токен: ${args.leadToken}

Контакт клиента:
${args.guestContact.slice(0, 3500)}

Ответьте в боте или обновите статус.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "Взял в работу", callback_data: `L|work|${args.leadToken}` },
        { text: "Связался", callback_data: `L|contacted|${args.leadToken}` },
      ],
      [
        { text: "Забронировано", callback_data: `L|booked|${args.leadToken}` },
        { text: "Не забронировано", callback_data: `L|lost|${args.leadToken}` },
      ],
    ],
  };

  const res = await callTelegramJson(env, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    reply_markup: keyboard,
  });
  return res.ok ? { ok: true } : { ok: false, error: res.description ?? "send_failed" };
}

export { hasOrganizerTelegramChat };
