import type { Env } from "@mywave/config";
import { callTelegramJson } from "../telegram/telegramApi";
import { validateAndRecordDeeplink } from "./deeplink.service";
import { getProgramCardForTelegram, formatProgramCardText } from "./programCard";
import { upsertTelegramUser } from "./users";
import { startLeadAttempt, updateLeadAttemptStep, submitTelegramLead } from "./leads.service";
import { fetchLeadAttemptSession, saveLeadAttemptSession, clearLeadAttemptSession } from "./webhookSessionStore";
import { parseOrganizerLeadCallback, applyOrganizerLeadStatus } from "./organizerStatus";
import { parseOpsLeadCallback, applyOpsLeadStatus } from "./opsLeadStatus";
import { parseReconciliationCallback, applyReconciliationCallback } from "./reconciliation";
import { requiredConsentsForProgram, CONSENT_TEXTS, type RequiredConsentType } from "./consentTexts";
import { consentLabel, formatConsentList, leadSubmitErrorMessage } from "./userMessages";
import { prisma } from "../../lib/prisma";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";

// Minimal Telegram update types (subset).
type TgUser = { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
type CallbackQuery = { id: string; from: TgUser; message?: { message_id: number; chat: { id: number } }; data?: string };
type Message = { message_id: number; from?: TgUser; chat: { id: number; type?: string }; text?: string };
export type TelegramUpdate = { update_id: number; callback_query?: CallbackQuery; message?: Message };

function mdEscape(s: string): string {
  // Very small Markdown escape for Telegram parse_mode=Markdown.
  return s.replace(/([_*`\\[])/g, "\\$1");
}

export async function handleTelegramPlatformUpdate(
  env: Env,
  update: TelegramUpdate
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (update.callback_query) {
    return handleCallback(env, update.callback_query);
  }
  if (update.message) {
    return handleMessage(env, update.message);
  }
  return { ok: true };
}

async function handleCallback(env: Env, cb: CallbackQuery) {
  const data = cb.data?.trim() ?? "";
  if (!data) return { ok: true as const };

  // OPS routing callbacks: O|...
  const opsCb = parseOpsLeadCallback(data);
  if (opsCb) {
    await applyOpsLeadStatus({
      leadToken: opsCb.leadToken,
      action: opsCb.action,
      actorId: `tg:${cb.from.id}`,
    });
    await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id });
    await callTelegramJson(env, "sendMessage", {
      chat_id: cb.message?.chat.id,
      text: "Оператор: статус заявки обновлён.",
    });
    return { ok: true as const };
  }

  // Organizer status callbacks: L|...
  const orgCb = parseOrganizerLeadCallback(data);
  if (orgCb) {
    await applyOrganizerLeadStatus({ leadToken: orgCb.leadToken, action: orgCb.action, actorId: `tg:${cb.from.id}` });
    await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id });
    await callTelegramJson(env, "sendMessage", { chat_id: cb.message?.chat.id, text: "Статус заявки обновлён." });
    return { ok: true as const };
  }

  // Reconciliation callbacks: R|...
  const recCb = parseReconciliationCallback(data);
  if (recCb) {
    await applyReconciliationCallback({ leadToken: recCb.leadToken, action: recCb.action });
    await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id });
    await callTelegramJson(env, "sendMessage", { chat_id: cb.message?.chat.id, text: "Сверка сохранена. Спасибо!" });
    return { ok: true as const };
  }

  // Consent callbacks: consent:<key>
  const mConsent = data.match(/^consent:([a-z_]{2,32})$/i);
  if (mConsent) {
    const chatId = cb.message?.chat.id;
    if (!chatId) return { ok: true as const };

    const session = await fetchLeadAttemptSession(String(chatId));
    if (!session) {
      await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Сессия истекла" });
      return { ok: true as const };
    }

    const key = mConsent[1]!.toLowerCase();
    session.consentsAccepted = session.consentsAccepted ?? [];
    if (!session.consentsAccepted.includes(key)) session.consentsAccepted.push(key);
    await saveLeadAttemptSession(String(chatId), session);

    const required = session.pendingConsents ?? [];
    const missing = required.filter((c) => !session.consentsAccepted!.includes(c));
    await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Принято" });
    if (missing.length > 0) {
      await callTelegramJson(env, "sendMessage", {
        chat_id: chatId,
        text: `Осталось подтвердить: ${formatConsentList(missing)}`,
      });
      return { ok: true as const };
    }

    if (!session.attemptId || !session.telegramUserId) {
      await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Сессия истекла. Начните заявку заново." });
      await clearLeadAttemptSession(String(chatId));
      return { ok: true as const };
    }

    const out = await submitTelegramLead(env, {
      attemptId: session.attemptId,
      telegramUserId: session.telegramUserId,
      consents: session.consentsAccepted as RequiredConsentType[],
    });
    if (!out.ok) {
      await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: leadSubmitErrorMessage(out.error) });
      return { ok: true as const };
    }
    await clearLeadAttemptSession(String(chatId));
    await callTelegramJson(env, "sendMessage", {
      chat_id: chatId,
      text: `Заявка отправлена.\nТокен: ${out.leadToken}\nОрганизатор свяжется с вами. MyWave Tour — посредник, не организатор поездки.`,
    });
    return { ok: true as const };
  }

  // Apply flow callback: apply:<programId>
  const mApply = data.match(/^apply:([a-z0-9]{8,32})$/i);
  if (mApply) {
    const chatId = cb.message?.chat.id;
    if (!chatId) return { ok: true as const };

    const tgUser = await upsertTelegramUser({
      telegramUserId: BigInt(cb.from.id),
      username: cb.from.username,
      firstName: cb.from.first_name,
      lastName: cb.from.last_name,
      languageCode: cb.from.language_code,
    });
    const programId = mApply[1]!;
    const started = await startLeadAttempt({ telegramUserId: tgUser.id, programId, sourceChannel: "telegram_webhook" });
    if (!started.ok) {
      await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Программа недоступна." });
      return { ok: true as const };
    }
    await saveLeadAttemptSession(String(chatId), {
      telegramUserId: tgUser.id,
      attemptId: started.attemptId,
      programId,
      awaiting: "name",
    });
    await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id });
    await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Заявка на программу. Как вас зовут? (имя)" });
    return { ok: true as const };
  }

  // Unknown callback - ignore.
  return { ok: true as const };
}

async function handleMessage(env: Env, msg: Message) {
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  if (!text) return { ok: true as const };

  const from = msg.from;
  if (!from) return { ok: true as const };

  // /start with payload
  if (text.startsWith("/start")) {
    const payload = text.replace(/^\/start\s*/i, "").trim();
    const tgUser = await upsertTelegramUser({
      telegramUserId: BigInt(from.id),
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      languageCode: from.language_code,
    });

    if (payload) {
      const dl = await validateAndRecordDeeplink({ payload, telegramUserId: tgUser.id });
      if (dl.programId) {
        const card = await getProgramCardForTelegram(dl.programId);
        if (card) {
          const cardText = formatProgramCardText(card);
          // We can't rely on rich keyboards yet (need editMessage/callback mapping), keep minimal.
          await callTelegramJson(env, "sendMessage", {
            chat_id: chatId,
            text: cardText,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "Оставить заявку", callback_data: `apply:${card.id}` }]],
            },
          });
          return { ok: true as const };
        }
      }
      if (dl.leadToken) {
        await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: `Ваша заявка: ${dl.leadToken}` });
        return { ok: true as const };
      }
    }

    await callTelegramJson(env, "sendMessage", {
      chat_id: chatId,
      text:
        "MyWave Tour — подбор активных поездок и заявки организаторам.\n\n" +
        "Чтобы начать: откройте программу по ссылке из канала и нажмите «Оставить заявку».",
    });
    return { ok: true as const };
  }

  // Simple commands
  if (text.startsWith("/help")) {
    await callTelegramJson(env, "sendMessage", {
      chat_id: chatId,
      text: "Команды: /start /help\n\nMyWave не является организатором программ.",
    });
    return { ok: true as const };
  }

  // Lead FSM steps
  const session = await fetchLeadAttemptSession(String(chatId));
  if (!session || !session.awaiting || !session.attemptId || !session.telegramUserId) {
    return { ok: true as const };
  }

  if (session.awaiting === "name") {
    await updateLeadAttemptStep(session.attemptId, session.telegramUserId, "phone", {
      guestName: text,
      telegramUsername: from.username,
    } as any);
    session.awaiting = "phone";
    await saveLeadAttemptSession(String(chatId), session);
    await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Укажите телефон для связи:" });
    return { ok: true as const };
  }

  if (session.awaiting === "phone") {
    await updateLeadAttemptStep(session.attemptId, session.telegramUserId, "participants", { phone: text } as any);
    session.awaiting = "participants";
    await saveLeadAttemptSession(String(chatId), session);
    await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Сколько участников? (число)" });
    return { ok: true as const };
  }

  if (session.awaiting === "participants") {
    const n = parseInt(text, 10);
    await updateLeadAttemptStep(session.attemptId, session.telegramUserId, "comment", {
      participantsCount: Number.isFinite(n) ? n : 1,
    } as any);
    session.awaiting = "comment";
    await saveLeadAttemptSession(String(chatId), session);
    await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Комментарий (или «-» чтобы пропустить):" });
    return { ok: true as const };
  }

  if (session.awaiting === "comment") {
    if (text !== "-") {
      await updateLeadAttemptStep(session.attemptId, session.telegramUserId, "preview", { comment: text } as any);
    }
    // Required consents from real program risk + kids heuristic.
    const program = await prisma.program.findUnique({
      where: { id: session.programId ?? "" },
      select: { publishStatus: true, riskLevel: true, audienceFit: true },
    });
    if (!program || !isProgramPubliclyVisible(program)) {
      await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: "Программа недоступна." });
      await clearLeadAttemptSession(String(chatId));
      return { ok: true as const };
    }
    const isKids =
      (program.audienceFit ?? "").toLowerCase().includes("дет") ||
      (program.audienceFit ?? "").toLowerCase().includes("kids");
    const required = requiredConsentsForProgram(program.riskLevel, isKids);
    session.pendingConsents = required;
    session.consentsAccepted = [];
    session.awaiting = "consent";
    await saveLeadAttemptSession(String(chatId), session);

    const preview =
      "Подтвердите согласия (обязательные пункты):\n\n" +
      required.map((k) => `• ${mdEscape(CONSENT_TEXTS[k])}`).join("\n\n");

    const keyboard = {
      inline_keyboard: required.map((k) => [
        { text: `Подтверждаю: ${consentLabel(k)}`, callback_data: `consent:${k}` },
      ]),
    };
    await callTelegramJson(env, "sendMessage", { chat_id: chatId, text: preview, reply_markup: keyboard });
    return { ok: true as const };
  }

  return { ok: true as const };
}
