import { buildTelegramFileApiUrl, type Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson, resolveContentOwnerChatId } from "./telegramApi";
import {
  applyRewrite,
  handleApprovalDecision,
  parseCallbackData,
  requestRewrite,
  sendDraftToOwner,
} from "../content-pipeline/approval.service";
import { transcribeOggOrMp3 } from "./transcribeVoice";
import { parseOutreachCallback } from "../organizer-outreach/notify";
import {
  approveAndSendOutreachCampaign,
  skipOutreachCampaign,
  declineOutreachCampaign,
} from "../organizer-outreach/service";
import { proxyFetch } from "../../lib/proxyFetch";
import { submitSourceProposal } from "../sources/sourceProposal";

type TgUser = { id: number; username?: string; first_name?: string };
type CallbackQuery = {
  id: string;
  from: TgUser;
  message?: { message_id: number; chat: { id: number } };
  data?: string;
};

type Message = {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string };
  reply_to_message?: { message_id: number; chat: { id: number } };
};

type TelegramUpdate = {
  update_id: number;
  callback_query?: CallbackQuery;
  message?: Message;
};

function isOwnerChat(env: Env, chatId: number): boolean {
  const owner = resolveContentOwnerChatId(env);
  return !!owner && String(chatId) === String(owner);
}

/** Скачать файл голоса (Bot API + file). */
export async function downloadTelegramFile(env: Env, fileId: string): Promise<{ buf: Buffer; mime: string } | null> {
  const g = await callTelegramJson<{ file_path: string; file_size: number }>(env, "getFile", { file_id: fileId });
  if (!g.ok || !g.result?.file_path) {
    return null;
  }
  const u = buildTelegramFileApiUrl(env, g.result.file_path);
  if (!u) return null;
  const r = await proxyFetch(u, {}, env.TELEGRAM_BOT_HTTP_PROXY);
  if (!r.ok) return null;
  const ab = await r.arrayBuffer();
  return { buf: Buffer.from(ab), mime: g.result.file_path.endsWith("oga") || g.result.file_path.endsWith("ogg") ? "audio/ogg" : "audio/mpeg" };
}

/**
 * answerCallbackQuery + разбор callback / сообщений.
 */
export async function handleTelegramContentPipelineUpdate(
  env: Env,
  update: TelegramUpdate,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (update.callback_query) {
    return handleCallbackQuery(env, update.callback_query);
  }
  if (update.message) {
    return handleOwnerMessage(env, update.message);
  }
  return { ok: true };
}

async function handleOutreachCallback(
  env: Env,
  cb: CallbackQuery,
  out: { action: "approve" | "rewrite" | "skip" | "noSend"; campaignId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const decidedBy = `tg:${cb.from.id}`;
  if (out.action === "approve") {
    const r = await approveAndSendOutreachCampaign(env, out.campaignId, decidedBy);
    if (!r.ok) {
      await answerText(env, cb.id, "Не удалось выполнить действие. Повторите попытку.");
      return { ok: false, error: r.error ?? "outreach" };
    }
  } else if (out.action === "skip") {
    await skipOutreachCampaign(out.campaignId, decidedBy);
  } else if (out.action === "noSend") {
    await declineOutreachCampaign(out.campaignId, decidedBy);
  } else if (out.action === "rewrite") {
    await prisma.organizerOutreachCampaign.update({
      where: { id: out.campaignId },
      data: { status: "draft", errorMessage: "rewrite_from_telegram" },
    });
  }
  await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id });
  return { ok: true };
}

async function handleCallbackQuery(
  env: Env,
  cb: CallbackQuery,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isOwnerChat(env, cb.message?.chat.id ?? 0)) {
    await answerEmpty(env, cb.id);
    return { ok: false, error: "unauthorized chat" };
  }
  if (!cb.data) {
    await answerEmpty(env, cb.id);
    return { ok: false, error: "no data" };
  }
  const out = parseOutreachCallback(cb.data);
  if (out) {
    return handleOutreachCallback(env, cb, out);
  }
  const parsed = parseCallbackData(cb.data);
  if (!parsed) {
    await answerEmpty(env, cb.id);
    return { ok: false, error: "invalid callback" };
  }
  const decidedBy = `tg:${cb.from.id}`;
  const actionMap = {
    publish: "approved" as const,
    rewrite: "rewrite_requested" as const,
    reject: "rejected" as const,
    skip: "skipped" as const,
  };
  const decision = actionMap[parsed.action];
  const res = await handleApprovalDecision({
    contentDraftId: parsed.draftId,
    decision,
    decidedBy,
    source: "telegram",
    callbackId: cb.id,
  });
  if (!res.ok) {
    await answerText(env, cb.id, "Не удалось выполнить действие. Повторите попытку.");
    return res;
  }
  if (res.duplicate) {
    await answerText(env, cb.id, "Уже обработано.");
    return { ok: true };
  }
  if (parsed.action === "rewrite") {
    await requestRewrite(env, parsed.draftId);
  }
  await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id });
  return { ok: true };
}

async function answerText(env: Env, callbackQueryId: string, text: string): Promise<void> {
  await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: true });
}

async function answerEmpty(env: Env, callbackQueryId: string): Promise<void> {
  await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

async function handleOwnerMessage(
  env: Env,
  msg: Message,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isOwnerChat(env, msg.chat.id)) {
    return { ok: false, error: "unauthorized" };
  }

  if (msg.text?.startsWith("/")) {
    return handleSourceProposalCommand(env, msg);
  }

  const item = await prisma.contentItem.findFirst({
    where: { ownerReviewAwaitingDraftId: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: { ownerReviewAwaitingDraft: true },
  });
  if (!item?.ownerReviewAwaitingDraftId || !item.ownerReviewAwaitingDraft) {
    return { ok: true };
  }
  const d = item.ownerReviewAwaitingDraft;
  if (d.telegramPreviewChatId && String(d.telegramPreviewChatId) !== String(msg.chat.id)) {
    return { ok: true };
  }
  if (item.workflowStatus !== "rewrite_requested" || d.id !== item.ownerReviewAwaitingDraftId) {
    return { ok: true };
  }

  let text = (msg.text ?? "").trim();
  let transcript: string | null = null;
  let fileId: string | undefined;
  if (msg.voice) {
    fileId = msg.voice.file_id;
    const dl = await downloadTelegramFile(env, msg.voice.file_id);
    if (dl) {
      transcript = await transcribeOggOrMp3(env, dl.buf, dl.mime);
    }
    if (!text) {
      text = transcript ?? "[голос: расшифровка недоступна, скорректируйте вручную]";
    }
  }
  if (!text.trim() && !transcript?.trim()) {
    await callTelegramJson(env, "sendMessage", {
      chat_id: String(msg.chat.id),
      text: "Пустой ввод. Отправьте текст или короткое голосовое.",
    });
    return { ok: true };
  }

  const userId = `tg:${msg.from?.id ?? "unknown"}`;
  const r = await applyRewrite(env, {
    parentDraftId: d.id,
    text: (msg.text ?? "").trim() || text,
    transcript: transcript,
    decidedBy: userId,
    voiceFileId: fileId,
  });
  if (!r.ok) {
    await callTelegramJson(env, "sendMessage", {
      chat_id: String(msg.chat.id),
      text: "Не удалось применить правки. Повторите попытку.",
    });
    return { ok: false, error: (r as { error: string }).error };
  }
  return { ok: true };
}

function sourceProposalAllowedUserIds(env: Env): Set<string> {
  return new Set(
    (env.TELEGRAM_SOURCE_PROPOSAL_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value)),
  );
}

async function handleSourceProposalCommand(env: Env, msg: Message): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = msg.text?.trim() ?? "";
  const match = /^\/source(?:@[a-z0-9_]+)?\s+(.+)$/i.exec(text);
  if (!match) return { ok: true };

  const userId = msg.from?.id ? String(msg.from.id) : "";
  if (!sourceProposalAllowedUserIds(env).has(userId)) {
    // Intentionally no reply: this is an owner-chat command with an explicit allowlist.
    return { ok: true };
  }

  const [url, ...nameParts] = match[1].trim().split(/\s+/);
  try {
    const result = await submitSourceProposal({
      url,
      displayName: nameParts.join(" "),
      submittedVia: "telegram",
      submittedBy: `tg:${userId}`,
    });
    const textByKind =
      result.kind === "created"
        ? "Заявка на источник принята. Она не запускает парсинг и ждёт проверки в админке."
        : result.kind === "duplicate"
          ? "Такая заявка уже ожидает проверки в админке."
          : "Этот источник уже существует в каталоге.";
    await callTelegramJson(env, "sendMessage", { chat_id: String(msg.chat.id), text: textByKind });
    return { ok: true };
  } catch {
    await callTelegramJson(env, "sendMessage", {
      chat_id: String(msg.chat.id),
      text: "Не удалось принять заявку. Используйте: /source https://example.org Название",
    });
    return { ok: true };
  }
}

export type { TelegramUpdate };
