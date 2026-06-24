import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { computeTravelerKeyHash } from "../../lib/travelerKey";
import { callTelegramJson } from "../telegram/telegramApi";
import type { TelegramUpdate } from "../telegram/telegramApprovalHandler";
import {
  buildOpsMissingContactKeyboard,
  sendTelegramPlatformOpsMessage,
  sendTelegramPlatformOrganizerMessage,
} from "./notify";
import { recordTelegramPlatformAction, type TelegramPlatformAction } from "./webhookSessionStore";

type TgUser = { id: number; username?: string; first_name?: string; last_name?: string };
type PlatformResult = { ok: true } | { ok: false; error: string };

const OPS_STATUS = "organizer_telegram_channel_missing";
const OPS_REASON = "missing_real_data";
const OPS_ACTION = "manual_processing_required";

function escapeHtml(input: string | null | undefined): string {
  return String(input ?? "needs_verification")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmt.format(start)}–${fmt.format(end)}`;
}

function extractLeadProgramId(text: string | undefined): string | null {
  const value = text?.trim() ?? "";
  const patterns = [/^\/start\s+(?:lead_|mtlead_)([A-Za-z0-9_-]+)/, /^\/lead\s+([A-Za-z0-9_-]+)/, /^lead:([A-Za-z0-9_-]+)/];
  for (const pattern of patterns) {
    const m = value.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

function guestContactFromTelegramUser(user: TgUser | undefined, chatId: number): string {
  const realTelegramId = user?.id ?? chatId;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return JSON.stringify({
    channel: "telegram",
    telegramUserId: realTelegramId,
    telegramUsername: user?.username ?? null,
    name: name || null,
    chatId,
  });
}

function leadNotes(input: { status: string; reason?: string; routeTo?: string; action?: string; telegramUserId?: number }): string {
  return JSON.stringify({
    telegramPlatform: {
      status: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.routeTo ? { route_to: input.routeTo } : {}),
      ...(input.action ? { action: input.action } : {}),
      telegramUserId: input.telegramUserId ?? null,
    },
  });
}

function buildOpsMissingContactMessage(input: {
  leadId: string;
  programTitle: string;
  dates: string;
  organizerName: string;
  source: string;
}): string {
  return [
    "<b>MyWaveTour: заявка требует ручной обработки</b>",
    `Lead ID: <code>${escapeHtml(input.leadId)}</code>`,
    `Program title: ${escapeHtml(input.programTitle)}`,
    `Program dates: ${escapeHtml(input.dates)}`,
    `Organizer name: ${escapeHtml(input.organizerName)}`,
    `Source: ${escapeHtml(input.source)}`,
    `Status: <code>${OPS_STATUS}</code>`,
    `Причина ручной обработки: <code>${OPS_REASON}</code>`,
    `Route to: <code>OPS</code>`,
    `Action: <code>${OPS_ACTION}</code>`,
  ].join("\n");
}

function buildOrganizerLeadMessage(input: { leadId: string; programTitle: string; dates: string; source: string }): string {
  return [
    "<b>MyWaveTour: новая заявка</b>",
    `Lead ID: <code>${escapeHtml(input.leadId)}</code>`,
    `Program title: ${escapeHtml(input.programTitle)}`,
    `Program dates: ${escapeHtml(input.dates)}`,
    `Source: ${escapeHtml(input.source)}`,
    "Статус: <code>sent_to_organizer</code>",
  ].join("\n");
}

async function handleLeadStart(env: Env, update: TelegramUpdate): Promise<PlatformResult> {
  const msg = update.message;
  if (!msg) return { ok: true };
  const programId = extractLeadProgramId(msg.text);
  if (!programId) return { ok: true };

  const program = await prisma.program.findFirst({
    where: { id: programId, publishStatus: "published" },
    include: {
      organizer: {
        include: { contactChannels: { where: { channelType: "telegram" }, orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!program) {
    return { ok: false, error: "published program not found: missing_real_data" };
  }

  const guestContact = guestContactFromTelegramUser(msg.from, msg.chat.id);
  const telegramChannel = program.organizer.contactChannels[0];
  const hasOrganizerChat = Boolean(telegramChannel?.telegramChatId?.trim());
  const status = hasOrganizerChat ? "sent_to_organizer" : OPS_STATUS;
  const notes = hasOrganizerChat
    ? leadNotes({ status, telegramUserId: msg.from?.id })
    : leadNotes({ status, reason: OPS_REASON, routeTo: "OPS", action: OPS_ACTION, telegramUserId: msg.from?.id });

  const lead = await prisma.lead.create({
    data: {
      programId: program.id,
      organizerId: program.organizerId,
      source: "telegram-platform",
      sourceChannel: "telegram",
      guestContact,
      travelerKeyHash: computeTravelerKeyHash(env, guestContact),
      notes,
    },
  });

  const dates = formatDateRange(program.startDate, program.endDate);
  if (!hasOrganizerChat) {
    const text = buildOpsMissingContactMessage({
      leadId: lead.id,
      programTitle: program.title,
      dates,
      organizerName: program.organizer.displayName,
      source: "telegram-platform",
    });
    const sent = await sendTelegramPlatformOpsMessage(env, text, buildOpsMissingContactKeyboard(lead.id));
    if (!sent.ok) return sent;
    return { ok: true };
  }

  const sent = await sendTelegramPlatformOrganizerMessage(
    env,
    telegramChannel.telegramChatId as string,
    buildOrganizerLeadMessage({ leadId: lead.id, programTitle: program.title, dates, source: "telegram-platform" }),
    { inline_keyboard: [[{ text: "Принял заявку", callback_data: `mtlead:organizer_ack:${lead.id}` }]] },
  );
  if (!sent.ok) return sent;
  return { ok: true };
}

function parsePlatformCallback(data: string | undefined): { scope: "mtops" | "mtlead"; action: TelegramPlatformAction; leadId: string } | null {
  const parts = (data ?? "").split(":");
  if (parts.length !== 3) return null;
  const [scope, action, leadId] = parts;
  if (scope !== "mtops" && scope !== "mtlead") return null;
  if (!["claim", "manual_contacted", "request_contact", "no_contact", "organizer_ack"].includes(action)) return null;
  if (!leadId) return null;
  return { scope, action: action as TelegramPlatformAction, leadId };
}

async function handlePlatformCallback(env: Env, update: TelegramUpdate): Promise<PlatformResult> {
  const cb = update.callback_query;
  if (!cb) return { ok: true };
  const parsed = parsePlatformCallback(cb.data);
  if (!parsed) return { ok: false, error: "invalid platform callback" };

  await recordTelegramPlatformAction({
    leadId: parsed.leadId,
    action: parsed.action,
    actorTelegramId: String(cb.from.id),
    callbackQueryId: cb.id,
    metadata: { scope: parsed.scope },
  });
  await callTelegramJson(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Зафиксировано" });
  return { ok: true };
}

export async function handleTelegramPlatformUpdate(env: Env, update: TelegramUpdate): Promise<PlatformResult> {
  if (update.callback_query) return handlePlatformCallback(env, update);
  if (update.message) return handleLeadStart(env, update);
  return { ok: true };
}
