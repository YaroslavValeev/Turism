import type { Env } from "@mywave/config";

function trimText(s: string | undefined | null): string {
  return (s ?? "").trim();
}

const MAX_CALLBACK = 64;

function safeCallback(prefix: string, draftId: string): string {
  const raw = `${prefix}:${draftId}`;
  return raw.length <= MAX_CALLBACK ? raw : `${prefix}:${draftId.slice(0, MAX_CALLBACK - prefix.length - 1)}`;
}

export type OwnerDraftPreview = {
  draftId: string;
  organizerName: string;
  programTitle: string;
  stage: number;
  plannedChannel: string;
  metricsLine: string;
  messagePreview: string;
};

function buildOwnerMessage(p: OwnerDraftPreview): string {
  const header = [
    "📋 Conversion funnel — нужно решение",
    "",
    `Организатор: ${p.organizerName}`,
    `Программа: ${p.programTitle}`,
    `Этап: ${p.stage}`,
    `Канал к организатору: ${p.plannedChannel}`,
    `Метрики: ${p.metricsLine}`,
    "",
    "— Черновик —",
    p.messagePreview,
    "",
    `id: ${p.draftId}`,
  ];
  return header.join("\n");
}

/**
 * Уведомление owner (TELEGRAM_ALERT_CHAT_ID) с inline-кнопками.
 */
export async function sendOwnerConversionDraftTelegram(
  env: Env,
  preview: OwnerDraftPreview,
): Promise<{ ok: boolean; reason?: string }> {
  const base = trimText(env.TELEGRAM_BOT_API_BASE_URL);
  const chatId = trimText(env.TELEGRAM_ALERT_CHAT_ID);
  if (!base || !chatId) {
    return { ok: false, reason: "owner_telegram_not_configured" };
  }
  const id = preview.draftId;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "Отправить", callback_data: safeCallback("send_draft", id) },
        { text: "Правка (admin)", callback_data: safeCallback("rewrite_draft", id) },
      ],
      [
        { text: "Отклонить", callback_data: safeCallback("reject_draft", id) },
        { text: "Отложить", callback_data: safeCallback("defer_draft", id) },
      ],
    ],
  };
  const text = buildOwnerMessage(preview);
  const url = `${base.replace(/\/+$/, "")}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.length > 4000 ? `${text.slice(0, 3900)}\n…(обрезано)` : text,
        disable_web_page_preview: true,
        reply_markup: keyboard,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      return { ok: false, reason: t.slice(0, 500) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function answerTelegramCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text: string,
  showAlert?: boolean,
): Promise<void> {
  const base = trimText(env.TELEGRAM_BOT_API_BASE_URL);
  if (!base || !callbackQueryId) return;
  const url = `${base.replace(/\/+$/, "")}/answerCallbackQuery`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text.slice(0, 200),
        show_alert: Boolean(showAlert),
      }),
    });
  } catch {
    /* ignore */
  }
}
