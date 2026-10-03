import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson } from "../telegram/telegramApi";
import { hashSubscriptionToken } from "./policy";

type OptInMessage = { text?: string; chat: { id: number; type?: string }; from?: { id: number; username?: string } };

/** Runs only behind the existing TELEGRAM_PUBLIC_BOT_ENABLED gate. Never uses an ID as a bearer token. */
export async function handleSubscriptionOptIn(env: Env, msg: OptInMessage): Promise<boolean> {
  const privateChat = msg.chat.type === "private" && Number.isSafeInteger(msg.chat.id) && msg.chat.id > 0 && msg.from?.id === msg.chat.id;
  if (/^\/stop(?:@[a-z0-9_]+)?\s*$/i.test(msg.text ?? "")) {
    if (!env.TELEGRAM_PUBLIC_BOT_ENABLED || !privateChat) return true;
    await prisma.updateSubscription.updateMany({ where: { telegramChatId: String(msg.chat.id) },
      data: { channelTelegram: false, telegramChatId: null, telegramBoundAt: null, telegramTokenHash: null,
        telegramTokenExpiresAt: null, tgOptInUrl: null } });
    const result = await callTelegramJson(env, "sendMessage", { chat_id: String(msg.chat.id), text: "Личные Telegram-уведомления отключены. Email-подписки не изменены." });
    if (!result.ok) throw new Error("subscription_stop_reply_failed");
    return true;
  }
  const payload = /^\/start(?:@[a-z0-9_]+)?\s+(mywave_sub_\S+)\s*$/i.exec(msg.text ?? "")?.[1];
  if (!payload) return false;
  if (!env.TELEGRAM_PUBLIC_BOT_ENABLED) return true;
  if (!privateChat) return true; // No subscription details or replies in groups.

  const token = /^mywave_sub_([a-f0-9]{48})$/.exec(payload)?.[1];
  const sub = token ? await prisma.updateSubscription.findUnique({ where: { telegramTokenHash: hashSubscriptionToken(token) } }) : null;
  const now = new Date();
  const chatId = String(msg.chat.id);
  const usernameMatches = Boolean(sub?.telegramUsername && msg.from?.username && sub.telegramUsername.toLowerCase() === msg.from.username.toLowerCase());
  let bound = Boolean(sub?.status === "active" && sub.channelTelegram && sub.consentAt && sub.telegramChatId === chatId);
  if (sub && !bound && !sub.telegramChatId && usernameMatches && sub.status === "active" && sub.channelTelegram && sub.consentAt && sub.telegramTokenExpiresAt && sub.telegramTokenExpiresAt > now) {
    const result = await prisma.updateSubscription.updateMany({
      where: { id: sub.id, status: "active", channelTelegram: true, consentAt: { not: null }, telegramChatId: null,
        telegramTokenHash: sub.telegramTokenHash, telegramTokenExpiresAt: { gt: now } },
      data: { telegramChatId: chatId, telegramBoundAt: now, telegramTokenExpiresAt: now },
    });
    bound = result.count === 1;
  }
  const response = await callTelegramJson(env, "sendMessage", { chat_id: chatId,
    text: bound ? "Telegram-подписка подтверждена. Новые поездки будут приходить по выбранным условиям. Отключить личные уведомления: /stop."
      : "Ссылка недействительна, истекла или создана для другого username. Оформите подписку заново на сайте." });
  if (!response.ok) throw new Error("subscription_optin_reply_failed");
  return true;
}
