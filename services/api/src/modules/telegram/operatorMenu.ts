import {
  type OrganizerVerificationStatus,
  type ProgramPublishStatus,
} from "@mywave/shared-types";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { runDedupJob, runNormalizationJob, runSourceCollection } from "../ingestion/service";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { callTelegramJson } from "./telegramApi";

type TelegramChat = { id: number };

type TelegramCallback = {
  id: string;
  from: { id: number };
  message?: { chat: TelegramChat };
  data?: string;
};

type OperatorAction =
  | { kind: "menu" }
  | { kind: "source_help" }
  | { kind: "source_list" }
  | { kind: "source_confirm"; sourceId: string }
  | { kind: "source_run"; sourceId: string }
  | { kind: "organizer_list" }
  | { kind: "organizer_show"; organizerId: string }
  | { kind: "organizer_status"; organizerId: string; status: OrganizerVerificationStatus }
  | { kind: "program_list" }
  | { kind: "program_show"; programId: string }
  | { kind: "program_status"; programId: string; status: Exclude<ProgramPublishStatus, "published"> };

const MAX_MENU_ROWS = 8;

const organizerStatusCodes: Record<string, OrganizerVerificationStatus> = {
  l: "listed",
  c: "checked",
  v: "verified",
  t: "trusted_by_platform",
  p: "paused",
  r: "rejected",
};

const organizerStatusLabels: Record<OrganizerVerificationStatus, string> = {
  listed: "В листинге",
  checked: "Проверен",
  verified: "Верифицирован",
  trusted_by_platform: "Доверенный",
  paused: "На паузе",
  rejected: "Отклонён",
};

const programStatusCodes: Record<string, Exclude<ProgramPublishStatus, "published">> = {
  d: "draft",
  i: "internal_review",
  f: "needs_fix",
  a: "approved",
  p: "paused",
  x: "archived",
};

const programStatusLabels: Record<Exclude<ProgramPublishStatus, "published">, string> = {
  draft: "Черновик",
  internal_review: "Проверка",
  needs_fix: "Доработать",
  approved: "Одобрена",
  paused: "На паузе",
  archived: "В архиве",
};

function organizerStatusLabel(status: string): string {
  return organizerStatusLabels[status as OrganizerVerificationStatus] ?? status;
}

function truncate(value: string, limit = 44): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function operatorUserIds(env: Env): Set<string> {
  return new Set(
    (env.TELEGRAM_SOURCE_PROPOSAL_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value)),
  );
}

export function isTelegramOperator(env: Env, chatId: number | undefined, userId: number | undefined): boolean {
  const ownerChat = env.TELEGRAM_CONTENT_OWNER_CHAT_ID?.trim() || env.TELEGRAM_ALERT_CHAT_ID?.trim();
  return Boolean(ownerChat && chatId != null && userId != null && String(chatId) === ownerChat && operatorUserIds(env).has(String(userId)));
}

export function parseOperatorCallback(data: string | undefined): OperatorAction | null {
  if (!data?.startsWith("mw:")) return null;
  if (data === "mw:menu") return { kind: "menu" };
  if (data === "mw:source") return { kind: "source_help" };
  if (data === "mw:sources") return { kind: "source_list" };
  if (data === "mw:orgs") return { kind: "organizer_list" };
  if (data === "mw:programs") return { kind: "program_list" };

  const sourceRun = /^mw:run:([a-z0-9]+)$/i.exec(data);
  if (sourceRun) return { kind: "source_run", sourceId: sourceRun[1] };

  const sourceConfirm = /^mw:runconfirm:([a-z0-9]+)$/i.exec(data);
  if (sourceConfirm) return { kind: "source_confirm", sourceId: sourceConfirm[1] };

  const organizerShow = /^mw:org:([a-z0-9]+)$/i.exec(data);
  if (organizerShow) return { kind: "organizer_show", organizerId: organizerShow[1] };

  const organizerStatus = /^mw:os:([a-z0-9]+):([lcvtpr])$/i.exec(data);
  if (organizerStatus && organizerStatusCodes[organizerStatus[2]]) {
    return { kind: "organizer_status", organizerId: organizerStatus[1], status: organizerStatusCodes[organizerStatus[2]] };
  }

  const programShow = /^mw:program:([a-z0-9]+)$/i.exec(data);
  if (programShow) return { kind: "program_show", programId: programShow[1] };

  const programStatus = /^mw:ps:([a-z0-9]+):([difapx])$/i.exec(data);
  if (programStatus && programStatusCodes[programStatus[2]]) {
    return { kind: "program_status", programId: programStatus[1], status: programStatusCodes[programStatus[2]] };
  }

  return null;
}

async function sendMessage(env: Env, chatId: number, text: string, keyboard?: unknown): Promise<void> {
  await callTelegramJson(env, "sendMessage", {
    chat_id: String(chatId),
    text,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function sendTelegramOperatorMenu(env: Env, chatId: number): Promise<void> {
  await sendMessage(env, chatId, "Панель оператора MyWaveTour. Все действия доступны только разрешённому оператору.", {
    inline_keyboard: [
      [{ text: "➕ Предложить источник", callback_data: "mw:source" }],
      [{ text: "▶️ Прогнать источник", callback_data: "mw:sources" }],
      [{ text: "🏢 Статус организатора", callback_data: "mw:orgs" }],
      [{ text: "📅 Статус программы", callback_data: "mw:programs" }],
    ],
  });
}

async function sendSourceList(env: Env, chatId: number): Promise<void> {
  const sources = await prisma.source.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_MENU_ROWS,
  });
  await sendMessage(env, chatId, sources.length ? "Выберите активный источник для полного ручного цикла: сбор → нормализация → дедупликация. Автопубликация не запускается." : "Активных источников нет.", {
    inline_keyboard: [
      ...sources.map((source) => [{ text: `▶ ${truncate(source.name)} · ${source.type}`, callback_data: `mw:runconfirm:${source.id}` }]),
      [{ text: "← Меню", callback_data: "mw:menu" }],
    ],
  });
}

async function sendSourceRunConfirmation(env: Env, chatId: number, sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { id: true, name: true, isActive: true } });
  if (!source?.isActive) {
    await sendMessage(env, chatId, "Источник недоступен для запуска. Проверьте, что он существует и включён в Admin.");
    return;
  }
  await sendMessage(env, chatId, `Запустить ${truncate(source.name)}? Будут выполнены сбор, нормализация и дедупликация только этого источника. Автопубликация не запускается.`, {
    inline_keyboard: [
      [{ text: "Подтвердить запуск", callback_data: `mw:run:${source.id}` }],
      [{ text: "Отмена", callback_data: "mw:sources" }],
    ],
  });
}

async function runActiveSource(env: Env, chatId: number, sourceId: string, actorId: string): Promise<void> {
  const source = await prisma.source.findUnique({ where: { id: sourceId }, select: { id: true, name: true, isActive: true } });
  if (!source) {
    await sendMessage(env, chatId, "Источник не найден.");
    return;
  }
  if (!source.isActive) {
    await sendMessage(env, chatId, "Источник выключен. Сначала включите его в Admin, затем запустите сбор.");
    return;
  }
  await sendMessage(env, chatId, `Запускаю ${truncate(source.name)}: сбор → нормализация → дедупликация. Автопубликация остаётся выключенной.`);
  try {
    await runSourceCollection(source.id, actorId);
    await runNormalizationJob(actorId, [source.id]);
    await runDedupJob(actorId, [source.id]);
    await sendMessage(env, chatId, `Готово: ${truncate(source.name)} обработан. Проверьте кандидаты в Admin.`);
  } catch {
    await sendMessage(env, chatId, `Не удалось обработать ${truncate(source.name)}. Смотрите «Задачи» в Admin.`);
  }
}

async function sendOrganizerList(env: Env, chatId: number): Promise<void> {
  const organizers = await prisma.organizer.findMany({
    select: { id: true, displayName: true, verificationStatus: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_MENU_ROWS,
  });
  await sendMessage(env, chatId, organizers.length ? "Выберите организатора для изменения статуса верификации." : "Организаторов нет.", {
    inline_keyboard: [
      ...organizers.map((organizer) => [{ text: `${truncate(organizer.displayName)} · ${organizerStatusLabel(organizer.verificationStatus)}`, callback_data: `mw:org:${organizer.id}` }]),
      [{ text: "← Меню", callback_data: "mw:menu" }],
    ],
  });
}

async function sendOrganizerStatusMenu(env: Env, chatId: number, organizerId: string): Promise<void> {
  const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { id: true, displayName: true, verificationStatus: true } });
  if (!organizer) {
    await sendMessage(env, chatId, "Организатор не найден.");
    return;
  }
  const entries = (Object.entries(organizerStatusCodes) as Array<[string, OrganizerVerificationStatus]>)
    .filter(([, status]) => status !== organizer.verificationStatus);
  await sendMessage(env, chatId, `${organizer.displayName}\nТекущий статус: ${organizerStatusLabel(organizer.verificationStatus)}`, {
    inline_keyboard: [
      ...entries.map(([code, status]) => [{ text: organizerStatusLabels[status], callback_data: `mw:os:${organizer.id}:${code}` }]),
      [{ text: "← К организаторам", callback_data: "mw:orgs" }],
    ],
  });
}

async function changeOrganizerStatus(env: Env, chatId: number, organizerId: string, status: OrganizerVerificationStatus, actorId: string): Promise<void> {
  const existing = await prisma.organizer.findUnique({ where: { id: organizerId } });
  if (!existing) {
    await sendMessage(env, chatId, "Организатор не найден.");
    return;
  }
  if (existing.verificationStatus === status) {
    await sendMessage(env, chatId, "Этот статус уже установлен.");
    return;
  }
  const organizer = await prisma.organizer.update({ where: { id: organizerId }, data: { verificationStatus: status } });
  await writeAuditLog({
    entityType: "organizer",
    entityId: organizer.id,
    changedField: "verification_status",
    oldValue: existing.verificationStatus,
    newValue: organizer.verificationStatus,
    changedBy: actorId,
    reason: "telegram operator menu",
  });
  if (organizer.verificationStatus === "verified") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "organizer_verified",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `organizer_verified:${organizer.id}`,
      organizer_id: organizer.id,
      verified_status: organizer.verificationStatus,
      properties_json: { from: existing.verificationStatus, to: organizer.verificationStatus },
    });
  }
  if (organizer.verificationStatus === "trusted_by_platform") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "organizer_trusted",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `organizer_trusted:${organizer.id}`,
      organizer_id: organizer.id,
      verified_status: organizer.verificationStatus,
      properties_json: { from: existing.verificationStatus, to: organizer.verificationStatus },
    });
  }
  await sendMessage(env, chatId, `${organizer.displayName}: ${organizerStatusLabel(organizer.verificationStatus)}.`);
}

async function sendProgramList(env: Env, chatId: number): Promise<void> {
  const programs = await prisma.program.findMany({
    select: { id: true, title: true, publishStatus: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_MENU_ROWS,
  });
  await sendMessage(env, chatId, programs.length ? "Выберите программу. Кнопки Telegram не публикуют программы; статус «Опубликована» доступен только через Admin с publish gate." : "Программ нет.", {
    inline_keyboard: [
      ...programs.map((program) => [{ text: `${truncate(program.title)} · ${program.publishStatus}`, callback_data: `mw:program:${program.id}` }]),
      [{ text: "← Меню", callback_data: "mw:menu" }],
    ],
  });
}

async function sendProgramStatusMenu(env: Env, chatId: number, programId: string): Promise<void> {
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true, title: true, publishStatus: true } });
  if (!program) {
    await sendMessage(env, chatId, "Программа не найдена.");
    return;
  }
  if (program.publishStatus === "published") {
    await sendMessage(env, chatId, `${program.title} уже опубликована. Менять её статус можно только в Admin.`);
    return;
  }
  const entries = (Object.entries(programStatusCodes) as Array<[string, Exclude<ProgramPublishStatus, "published">]>)
    .filter(([, status]) => status !== program.publishStatus);
  await sendMessage(env, chatId, `${program.title}\nТекущий статус: ${program.publishStatus}`, {
    inline_keyboard: [
      ...entries.map(([code, status]) => [{ text: programStatusLabels[status], callback_data: `mw:ps:${program.id}:${code}` }]),
      [{ text: "← К программам", callback_data: "mw:programs" }],
    ],
  });
}

async function changeProgramStatus(env: Env, chatId: number, programId: string, status: Exclude<ProgramPublishStatus, "published">, actorId: string): Promise<void> {
  const existing = await prisma.program.findUnique({ where: { id: programId } });
  if (!existing) {
    await sendMessage(env, chatId, "Программа не найдена.");
    return;
  }
  if (existing.publishStatus === "published") {
    await sendMessage(env, chatId, "Опубликованные программы меняются только в Admin.");
    return;
  }
  if (existing.publishStatus === status) {
    await sendMessage(env, chatId, "Этот статус уже установлен.");
    return;
  }
  const program = await prisma.program.update({ where: { id: programId }, data: { publishStatus: status } });
  await writeAuditLog({
    entityType: "program",
    entityId: program.id,
    changedField: "publish_status_change",
    oldValue: existing.publishStatus,
    newValue: program.publishStatus,
    changedBy: actorId,
    reason: "telegram operator menu; publication unavailable in telegram",
  });
  await sendMessage(env, chatId, `${truncate(program.title)}: ${programStatusLabels[status]}. Публикация через Telegram недоступна.`);
}

export async function handleTelegramOperatorCallback(env: Env, callback: TelegramCallback): Promise<boolean> {
  const action = parseOperatorCallback(callback.data);
  if (!action) return false;
  const chatId = callback.message?.chat.id;
  if (!isTelegramOperator(env, chatId, callback.from.id)) {
    await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Недостаточно прав", show_alert: true });
    return true;
  }
  await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: callback.id });
  const actorId = `tg:${callback.from.id}`;
  if (chatId == null) return true;
  if (action.kind === "menu") await sendTelegramOperatorMenu(env, chatId);
  if (action.kind === "source_help") await sendMessage(env, chatId, "Отправьте: /source https://example.org Название. Заявка не запускает парсинг и ждёт одобрения в Admin.");
  if (action.kind === "source_list") await sendSourceList(env, chatId);
  if (action.kind === "source_confirm") await sendSourceRunConfirmation(env, chatId, action.sourceId);
  if (action.kind === "source_run") await runActiveSource(env, chatId, action.sourceId, actorId);
  if (action.kind === "organizer_list") await sendOrganizerList(env, chatId);
  if (action.kind === "organizer_show") await sendOrganizerStatusMenu(env, chatId, action.organizerId);
  if (action.kind === "organizer_status") await changeOrganizerStatus(env, chatId, action.organizerId, action.status, actorId);
  if (action.kind === "program_list") await sendProgramList(env, chatId);
  if (action.kind === "program_show") await sendProgramStatusMenu(env, chatId, action.programId);
  if (action.kind === "program_status") await changeProgramStatus(env, chatId, action.programId, action.status, actorId);
  return true;
}
