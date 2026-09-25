/**
 * Операторский пульт MyWaveTour в owner-чате: /menu (+ /start, /help, /status).
 * Тяжёлые задачи (сбор, ремонт медиа) идут в фоне: webhook отвечает сразу, итог — отдельным сообщением.
 */
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson } from "../telegram/telegramApi";
import { runDailySyncJob } from "../ingestion/service";
import { archivePastByDates } from "../ingestion/archivePast.service";
import { refreshTelegramProgramMedia } from "../ingestion/telegramMedia";
import { buildMenuAdminCallback, type MenuAdminAction } from "./contracts";
import { sendProgramPublishQueue } from "./handler";

type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
type InlineKeyboard = { inline_keyboard: InlineButton[][] };

const QUEUE_STATUSES = ["draft", "internal_review", "needs_fix", "approved"];

export const OPERATOR_BOT_COMMANDS = [
  { command: "menu", description: "Пульт управления" },
  { command: "status", description: "Сводка: программы, кандидаты, сбор, фото" },
  { command: "check_publish", description: "Очередь публикации программ" },
  { command: "help", description: "Список команд" },
] as const;

function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL?.trim() || "https://mywavetour.ru").replace(/\/+$/, "");
}

function adminUrl(): string {
  return (process.env.ADMIN_PUBLIC_URL?.trim() || "https://admin.mywavetour.ru").replace(/\/+$/, "");
}

export function parseOperatorCommand(text: string | undefined): "menu" | "status" | "help" | null {
  if (!text) return null;
  const base = (text.trim().split(/\s+/)[0] ?? "").toLowerCase().split("@")[0];
  if (base === "/menu" || base === "/start" || base === "/ops") return "menu";
  if (base === "/status") return "status";
  if (base === "/help") return "help";
  return null;
}

export function buildOperatorMenuKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "📋 Очередь публикации", callback_data: buildMenuAdminCallback("queue") },
        { text: "📊 Статус", callback_data: buildMenuAdminCallback("status") },
      ],
      [
        { text: "🔄 Сбор источников", callback_data: buildMenuAdminCallback("sync") },
        { text: "🖼 Починить фото", callback_data: buildMenuAdminCallback("media") },
      ],
      // Пульт источников/организаторов из telegram/operatorMenu (префикс mw:).
      [{ text: "🧭 Источники и статусы", callback_data: "mw:menu" }],
      [
        { text: "🛠 Админка", url: `${adminUrl()}/event-candidates` },
        { text: "🌐 Сайт", url: siteUrl() },
      ],
      [{ text: "✖ Закрыть", callback_data: buildMenuAdminCallback("close") }],
    ],
  };
}

function buildConfirmKeyboard(confirm: MenuAdminAction): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Запустить", callback_data: buildMenuAdminCallback(confirm) },
        { text: "↩ Назад", callback_data: buildMenuAdminCallback("home") },
      ],
    ],
  };
}

const MENU_TEXT = [
  "<b>MyWaveTour — пульт</b>",
  "",
  "📋 Очередь — программы, ждущие публикации",
  "📊 Статус — сводка по сайту и сбору",
  "🔄 Сбор — собрать источники, которым пора (как ежедневный запуск)",
  "🖼 Фото — перекачать протухшие фото Telegram",
].join("\n");

const HELP_TEXT = [
  "<b>Команды бота</b>",
  "/menu — пульт с кнопками",
  "/status — сводка",
  "/check_publish — очередь публикации → Проверить → Опубликовать",
  "",
  "Сбор и ремонт фото запускаются кнопками в /menu с подтверждением.",
].join("\n");

export async function buildOperatorStatusText(now = new Date()): Promise<string> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [published, queue, needsReview, activeSources, running, failed24h, lastRun, staleMedia] = await Promise.all([
    prisma.program.count({ where: { publishStatus: "published", endDate: { gte: now } } }),
    prisma.program.count({ where: { publishStatus: { in: QUEUE_STATUSES }, endDate: { gte: now } } }),
    prisma.eventCandidate.count({ where: { status: "needs_review" } }),
    prisma.source.count({ where: { isActive: true } }),
    prisma.sourceRun.count({ where: { status: "running" } }),
    prisma.sourceRun.count({ where: { status: "failed", startedAt: { gte: dayAgo } } }),
    prisma.sourceRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, status: true } }),
    prisma.programMedia.count({ where: { url: { contains: "telesco.pe" } } }),
  ]);

  const lastRunText = lastRun
    ? `${lastRun.startedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК (${lastRun.status})`
    : "не было";

  return [
    "<b>📊 Статус MyWaveTour</b>",
    "",
    `Опубликовано (актуальные): <b>${published}</b>`,
    `Очередь публикации: <b>${queue}</b>`,
    `Кандидаты на проверку: <b>${needsReview}</b>`,
    "",
    `Активных источников: ${activeSources}`,
    `Последний сбор: ${lastRunText}`,
    `Сейчас выполняется: ${running}`,
    `Ошибок сбора за 24 ч: ${failed24h > 0 ? `⚠️ ${failed24h}` : "0"}`,
    "",
    `Протухшие фото Telegram: ${staleMedia > 0 ? `⚠️ ${staleMedia} — нажмите «Починить фото»` : "0"}`,
  ].join("\n");
}

async function sendText(env: Env, chatId: number, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
  await callTelegramJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editOrSendText(
  env: Env,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: InlineKeyboard,
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
  await sendText(env, chatId, text, replyMarkup);
}

/** Команды в меню «/» Telegram — только для owner-чата. */
async function registerOperatorCommands(env: Env, chatId: number): Promise<void> {
  await callTelegramJson(env, "setMyCommands", {
    commands: OPERATOR_BOT_COMMANDS,
    scope: { type: "chat", chat_id: chatId },
  });
}

export async function handleOperatorCommand(
  env: Env,
  chatId: number,
  command: "menu" | "status" | "help",
): Promise<void> {
  if (command === "status") {
    await sendText(env, chatId, await buildOperatorStatusText(), buildOperatorMenuKeyboard());
    return;
  }
  if (command === "help") {
    await sendText(env, chatId, HELP_TEXT);
    return;
  }
  await registerOperatorCommands(env, chatId).catch(() => undefined);
  await sendText(env, chatId, MENU_TEXT, buildOperatorMenuKeyboard());
}

let runningJob: string | null = null;

function startBackgroundJob(env: Env, chatId: number, label: string, job: () => Promise<string>): boolean {
  if (runningJob) return false;
  runningJob = label;
  void (async () => {
    const startedAt = Date.now();
    let text: string;
    try {
      const summary = await job();
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      text = `✅ <b>${label}</b> — готово за ${seconds} с\n\n${summary}`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      text = `❌ <b>${label}</b> — ошибка\n<code>${escapeHtml(reason.slice(0, 300))}</code>`;
    } finally {
      runningJob = null;
    }
    await sendText(env, chatId, text, buildOperatorMenuKeyboard()).catch(() => undefined);
  })();
  return true;
}

async function runSyncSummary(env: Env, actorId: string): Promise<string> {
  const result = await runDailySyncJob(actorId, {
    autoPublishEnabled: env.INGESTION_AUTOPUBLISH_ENABLED,
    fallbackImageUrl: env.INGESTION_DEFAULT_FALLBACK_IMAGE_URL,
  });
  // Как POST /jobs/run-daily-sync в админке: после сбора убираем в архив прошедшие по датам.
  const archived = await archivePastByDates(actorId);
  const archiveLine = `В архив (прошедшие): программ ${archived.programsArchived}, кандидатов ${archived.candidatesArchived}`;
  if (result.scope === "sources:0") {
    return ["Нет источников, которым пора собираться. Следующий сбор — по расписанию.", archiveLine].join("\n");
  }
  return [
    `Источников: ${result.scope.replace("sources:", "")}`,
    `Собрано записей: ${result.collect.processed}, новых: ${result.collect.created}`,
    `Нормализовано: ${result.normalize.processed}`,
    `Автопубликация: опубликовано ${result.autoPublish.published}, отсеяно гейтом ${result.autoPublish.gateSkipped}`,
    archiveLine,
  ].join("\n");
}

async function runMediaSummary(): Promise<string> {
  const result = await refreshTelegramProgramMedia();
  if (result.programsChecked === 0) return "Протухших фото Telegram нет — чинить нечего.";
  const lines = [
    `Программ проверено: ${result.programsChecked}`,
    `Обновлено: ${result.programsUpdated}`,
    `Файлов сохранено: ${result.mediaCached}`,
  ];
  for (const failure of result.failures.slice(0, 5)) {
    lines.push(`⚠️ <code>${escapeHtml(failure.programId)}</code>: ${escapeHtml(failure.reason)}`);
  }
  return lines.join("\n");
}

export type OperatorMenuCallbackResult = { toast?: string };

/** Возвращает текст всплывающего ответа на callback (answerCallbackQuery делает вызывающий). */
export async function handleOperatorMenuAction(
  env: Env,
  input: { action: MenuAdminAction; chatId: number; messageId?: number; actorId: string },
): Promise<OperatorMenuCallbackResult> {
  const { action, chatId, messageId, actorId } = input;

  switch (action) {
    case "home":
      await editOrSendText(env, chatId, messageId, MENU_TEXT, buildOperatorMenuKeyboard());
      return {};
    case "queue":
      await sendProgramPublishQueue(env, chatId);
      return {};
    case "status":
      await editOrSendText(env, chatId, messageId, await buildOperatorStatusText(), buildOperatorMenuKeyboard());
      return {};
    case "sync":
      await editOrSendText(
        env,
        chatId,
        messageId,
        "🔄 <b>Сбор источников</b>\n\nСоберёт источники, которым пора (как ежедневный запуск): сбор → нормализация → дедуп → автопубликация по гейту. Может занять несколько минут.",
        buildConfirmKeyboard("sync_confirm"),
      );
      return {};
    case "media":
      await editOrSendText(
        env,
        chatId,
        messageId,
        "🖼 <b>Починить фото</b>\n\nПерекачает фото программ со ссылками Telegram CDN (telesco.pe) к нам на сервер. Безопасно запускать повторно.",
        buildConfirmKeyboard("media_confirm"),
      );
      return {};
    case "sync_confirm":
    case "media_confirm": {
      const label = action === "sync_confirm" ? "Сбор источников" : "Ремонт фото";
      const started = startBackgroundJob(env, chatId, label, () =>
        action === "sync_confirm" ? runSyncSummary(env, actorId) : runMediaSummary(),
      );
      if (!started) return { toast: `Уже выполняется: ${runningJob}. Дождитесь результата.` };
      await editOrSendText(env, chatId, messageId, `⏳ <b>${label}</b> запущен. Результат придёт отдельным сообщением.`);
      return { toast: "Запущено" };
    }
    case "close":
      if (messageId != null) {
        await callTelegramJson(env, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });
      }
      return {};
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
