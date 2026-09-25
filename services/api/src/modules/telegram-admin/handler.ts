/**
 * Telegram Admin: операторский flow «Проверить и опубликовать» для Program.
 * Callbacks: MTA1|P|PRV|id / PUB / NFX / CXL. Команда: /check_publish
 */
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson } from "../telegram/telegramApi";
import { parseProgramAdminCallback, type ProgramAdminCallback } from "./contracts";
import { buildProgramPreviewKeyboard, buildProgramQueueKeyboard } from "./keyboards";
import {
  formatProgramQueueMessage,
  listProgramPublishQueue,
  loadProgramPublishPreview,
} from "./programPublish.service";
import { setProgramPublishStatus } from "../programs/publishStatus.service";

type CallbackQuery = {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
};

async function answerCallback(
  env: Env,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await callTelegramJson(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: true } : {}),
  });
}

async function editOrSend(
  env: Env,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  if (messageId != null) {
    const edited = await callTelegramJson(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    if (edited.ok) return;
  }
  await callTelegramJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function markCallbackProcessed(
  callbackId: string,
  action: string,
  programId: string,
): Promise<{ duplicate: boolean }> {
  const existing = await prisma.processedTelegramCallback.findUnique({ where: { id: callbackId } });
  if (existing) return { duplicate: true };
  await prisma.processedTelegramCallback.create({
    data: {
      id: callbackId,
      action: `program_${action}:${programId}`,
      contentDraftId: null,
      contentItemId: null,
    },
  });
  return { duplicate: false };
}

export async function sendProgramPublishQueue(env: Env, chatId: number): Promise<void> {
  const items = await listProgramPublishQueue();
  const text = formatProgramQueueMessage(items);
  await callTelegramJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(items.length
      ? { reply_markup: buildProgramQueueKeyboard(items) }
      : {}),
  });
}

export function isProgramPublishCommand(text: string | undefined): boolean {
  if (!text) return false;
  const cmd = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const base = cmd.split("@")[0];
  return base === "/check_publish" || base === "/programs_review";
}

export async function handleProgramAdminCallback(
  env: Env,
  cb: CallbackQuery,
): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const parsed = parseProgramAdminCallback(cb.data);
  if (!parsed) return null;
  return dispatchProgramAdminAction(env, cb, parsed);
}

async function dispatchProgramAdminAction(
  env: Env,
  cb: CallbackQuery,
  parsed: ProgramAdminCallback,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const chatId = cb.message?.chat.id;
  if (chatId == null) {
    await answerCallback(env, cb.id, "Нет chat_id");
    return { ok: false, error: "no chat" };
  }

  if (parsed.action === "cancel") {
    await answerCallback(env, cb.id, "Закрыто");
    if (cb.message?.message_id != null) {
      await callTelegramJson(env, "editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    }
    return { ok: true };
  }

  if (parsed.action === "preview") {
    const preview = await loadProgramPublishPreview(parsed.id);
    if (!preview.ok) {
      await answerCallback(env, cb.id, "Программа не найдена");
      return { ok: false, error: "not_found" };
    }
    await answerCallback(env, cb.id);
    await editOrSend(
      env,
      chatId,
      cb.message?.message_id,
      preview.text,
      buildProgramPreviewKeyboard({ programId: parsed.id, canPublish: preview.gateOk }),
    );
    return { ok: true };
  }

  if (parsed.action === "needs_fix") {
    const dup = await markCallbackProcessed(cb.id, "needs_fix", parsed.id);
    if (dup.duplicate) {
      await answerCallback(env, cb.id, "Уже обработано");
      return { ok: true };
    }
    const result = await setProgramPublishStatus(env, {
      programId: parsed.id,
      publishStatus: "needs_fix",
      actorId: `tg:${cb.from.id}`,
      reason: "telegram admin needs_fix",
    });
    if (!result.ok) {
      const msg =
        result.error === "not_found"
          ? "Программа не найдена"
          : result.error === "gate"
            ? "Gate error"
            : "Ошибка статуса";
      await answerCallback(env, cb.id, msg);
      return { ok: false, error: result.error };
    }
    await answerCallback(env, cb.id, "Статус: нужна доработка");
    await editOrSend(
      env,
      chatId,
      cb.message?.message_id,
      `Статус программы обновлён → <b>needs_fix</b> («Нужна доработка»).\n<code>${parsed.id}</code>`,
    );
    return { ok: true };
  }

  if (parsed.action === "publish") {
    const dup = await markCallbackProcessed(cb.id, "publish", parsed.id);
    if (dup.duplicate) {
      await answerCallback(env, cb.id, "Уже обработано");
      return { ok: true };
    }
    const result = await setProgramPublishStatus(env, {
      programId: parsed.id,
      publishStatus: "published",
      actorId: `tg:${cb.from.id}`,
      reason: "telegram admin publish",
    });
    if (!result.ok) {
      if (result.error === "gate") {
        await answerCallback(
          env,
          cb.id,
          `Gate: ${result.missing.slice(0, 4).join(", ")}${result.missing.length > 4 ? "…" : ""}`,
        );
        const preview = await loadProgramPublishPreview(parsed.id);
        if (preview.ok) {
          await editOrSend(
            env,
            chatId,
            cb.message?.message_id,
            preview.text,
            buildProgramPreviewKeyboard({ programId: parsed.id, canPublish: false }),
          );
        }
        return { ok: false, error: "gate" };
      }
      await answerCallback(
        env,
        cb.id,
        result.error === "not_found" ? "Программа не найдена" : "Ошибка статуса",
      );
      return { ok: false, error: result.error };
    }

    const note = result.alreadyPublished
      ? "Уже была published — повторной отправки в канал нет."
      : result.notified
        ? "Сайт + уведомление в Telegram-канал (если env настроен)."
        : "Статус published.";
    await answerCallback(env, cb.id, "Опубликовано");
    await editOrSend(
      env,
      chatId,
      cb.message?.message_id,
      [
        `<b>Опубликовано</b>`,
        escapeHtml(result.program.title),
        `Статус: <b>published</b> («Опубликована»)`,
        note,
        `<code>${parsed.id}</code>`,
      ].join("\n"),
    );
    return { ok: true };
  }

  await answerCallback(env, cb.id, "Неизвестное действие");
  return { ok: false, error: "unknown action" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
