import { prisma } from "../../lib/prisma";

/**
 * CTA под постом канала (Telegram Visual System v1, §13): «Программа», «Задать вопрос», «Оставить заявку».
 * Кнопки ведут через `/public/tg/c/:token` — запись TelegramClick фиксирует клик и делает redirect.
 * Если трекинг недоступен (API не публичный, ошибка БД) — кнопки ведут напрямую, пост не ломается.
 */

export type ChannelCtaKey = "program" | "ask" | "apply";

export type ChannelCta = { key: ChannelCtaKey; text: string; url: string };

export const CHANNEL_CLICK_PATH = "/public/tg/c";
export const CHANNEL_CLICK_CHANNEL = "telegram_channel";

export function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]";
  } catch {
    return false;
  }
}

function withUtmContent(url: string, content: ChannelCtaKey): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_content", content);
    return parsed.toString();
  } catch {
    return url;
  }
}

function withHash(url: string, hash: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = hash;
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Набор CTA в каноническом порядке. Кнопка без рабочего адреса не выводится:
 * «Задать вопрос» появляется только при заданном `askUrl` (Direct Messages канала / менеджер).
 */
export function buildChannelCtas(input: { programUrl: string; askUrl?: string | null }): ChannelCta[] {
  const out: ChannelCta[] = [];
  if (isPublicHttpUrl(input.programUrl)) {
    out.push({ key: "program", text: "Программа", url: withUtmContent(input.programUrl, "program") });
  }
  const ask = input.askUrl?.trim();
  if (ask && isPublicHttpUrl(ask)) {
    out.push({ key: "ask", text: "Задать вопрос", url: ask });
  }
  if (isPublicHttpUrl(input.programUrl)) {
    out.push({ key: "apply", text: "Оставить заявку", url: withHash(withUtmContent(input.programUrl, "apply"), "request") });
  }
  return out;
}

/** Раскладка: «Программа» и «Задать вопрос» в одном ряду, «Оставить заявку» — отдельной широкой кнопкой. */
export function ctasToInlineKeyboard(ctas: Array<{ key: ChannelCtaKey; text: string; url: string }>) {
  if (!ctas.length) return undefined;
  const top = ctas.filter((c) => c.key !== "apply").map(({ text, url }) => ({ text, url }));
  const apply = ctas.filter((c) => c.key === "apply").map(({ text, url }) => ({ text, url }));
  const inline_keyboard = [top, apply].filter((row) => row.length > 0);
  return { inline_keyboard };
}

export function channelClickUrl(apiBase: string, token: string): string {
  return `${apiBase.replace(/\/+$/, "")}${CHANNEL_CLICK_PATH}/${encodeURIComponent(token)}`;
}

export type TrackedChannelKeyboard = {
  replyMarkup: { inline_keyboard: Array<Array<{ text: string; url: string }>> } | undefined;
  clickTokens: string[];
};

export async function createTrackedChannelKeyboard(input: {
  apiBase: string;
  programId: string;
  campaign: string;
  ctas: ChannelCta[];
}): Promise<TrackedChannelKeyboard> {
  if (!input.ctas.length) return { replyMarkup: undefined, clickTokens: [] };
  if (!isPublicHttpUrl(input.apiBase)) {
    return { replyMarkup: ctasToInlineKeyboard(input.ctas), clickTokens: [] };
  }
  try {
    const rows = await prisma.$transaction(
      input.ctas.map((cta) =>
        prisma.telegramClick.create({
          data: {
            programId: input.programId,
            destinationUrl: cta.url,
            campaign: `${input.campaign}:${cta.key}`,
            channel: CHANNEL_CLICK_CHANNEL,
          },
          select: { token: true },
        }),
      ),
    );
    const tracked = input.ctas.map((cta, i) => ({ ...cta, url: channelClickUrl(input.apiBase, rows[i].token) }));
    return { replyMarkup: ctasToInlineKeyboard(tracked), clickTokens: rows.map((r) => r.token) };
  } catch (error) {
    console.error("[telegram] click tracking unavailable, using direct links", error instanceof Error ? error.message : String(error));
    return { replyMarkup: ctasToInlineKeyboard(input.ctas), clickTokens: [] };
  }
}

/** После публикации связываем клики с message_id поста (для аналитики по постам). */
export async function attachChannelPostId(clickTokens: string[], messageId: number | undefined): Promise<void> {
  if (!clickTokens.length || messageId == null) return;
  try {
    await prisma.telegramClick.updateMany({
      where: { token: { in: clickTokens } },
      data: { sourcePostId: String(messageId) },
    });
  } catch (error) {
    console.error("[telegram] attach channel post id failed", error instanceof Error ? error.message : String(error));
  }
}
