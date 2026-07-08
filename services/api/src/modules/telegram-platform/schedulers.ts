import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson } from "../telegram/telegramApi";
import { logTelegramPlatformEvent } from "./events";

/** Напоминания о брошенной заявке (2h / 24h). Вызывать из cron или ops-scheduler. */
export async function runAbandonedLeadReminders(env: Env): Promise<{ sent: number }> {
  const now = new Date();
  let sent = 0;

  const due2h = await prisma.telegramAbandonedLead.findMany({
    where: { status: "open", reminder2hAt: { lte: now } },
    take: 50,
    include: { telegramUser: true, attempt: { include: { program: { select: { title: true } } } } },
  });

  for (const row of due2h) {
    if (!env.TELEGRAM_BOT_API_BASE_URL || !row.telegramUser) continue;
    const chatId = row.telegramUser.telegramUserId.toString();
    const text = `Напоминание: вы начали заявку на «${row.attempt.program.title}», но не завершили. Продолжить?`;
    const res = await callTelegramJson(env, "sendMessage", { chat_id: chatId, text });
    if (res.ok) {
      sent += 1;
      await prisma.telegramAbandonedLead.update({
        where: { id: row.id },
        data: { status: "reminded_2h" },
      });
      await logTelegramPlatformEvent({
        eventName: "lead_abandoned",
        telegramUserId: row.telegramUserId,
        programId: row.attempt.programId,
        properties: { phase: "reminder_2h", attempt_id: row.attemptId },
      });
    }
  }

  const due24h = await prisma.telegramAbandonedLead.findMany({
    where: { status: "reminded_2h", reminder24hAt: { lte: now } },
    take: 50,
    include: { telegramUser: true, attempt: { include: { program: { select: { title: true } } } } },
  });

  for (const row of due24h) {
    if (!env.TELEGRAM_BOT_API_BASE_URL || !row.telegramUser) continue;
    const chatId = row.telegramUser.telegramUserId.toString();
    const text = `Можем сохранить программу «${row.attempt.program.title}» или подобрать похожие — напишите /start`;
    const res = await callTelegramJson(env, "sendMessage", { chat_id: chatId, text });
    if (res.ok) {
      sent += 1;
      await prisma.telegramAbandonedLead.update({
        where: { id: row.id },
        data: { status: "reminded_24h" },
      });
    }
  }

  const stale = await prisma.telegramAbandonedLead.findMany({
    where: {
      status: { in: ["reminded_24h", "reminded_2h"] },
      createdAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    take: 100,
  });
  for (const row of stale) {
    await prisma.telegramAbandonedLead.update({
      where: { id: row.id },
      data: { status: "closed", closedAt: new Date() },
    });
    await prisma.telegramLeadAttempt.updateMany({
      where: { id: row.attemptId, status: { not: "submitted" } },
      data: { status: "abandoned" },
    });
  }

  return { sent };
}

/** Создать задачи сверки для лидов без задачи (идемпотентно по leadId). */
export async function ensureReconciliationTasks(): Promise<{ created: number }> {
  const leads = await prisma.lead.findMany({
    where: {
      sentToOrganizerAt: { not: null },
      reconciliationTasks: { none: {} },
    },
    select: { id: true, organizerId: true, sentToOrganizerAt: true },
    take: 100,
  });
  let created = 0;
  for (const lead of leads) {
    const dueAt = new Date((lead.sentToOrganizerAt ?? new Date()).getTime() + 7 * 24 * 60 * 60 * 1000);
    await prisma.telegramReconciliationTask.create({
      data: { leadId: lead.id, organizerId: lead.organizerId, dueAt },
    });
    created += 1;
  }
  return { created };
}

export async function runReconciliationPrompts(env: Env): Promise<{ sent: number }> {
  const now = new Date();
  const tasks = await prisma.telegramReconciliationTask.findMany({
    where: { status: "pending", dueAt: { lte: now } },
    take: 30,
    include: {
      lead: {
        select: {
          leadToken: true,
          organizerId: true,
          program: { select: { title: true } },
        },
      },
    },
  });
  let sent = 0;
  for (const task of tasks) {
    const channel = await prisma.organizerContactChannel.findFirst({
      where: { organizerId: task.organizerId, channelType: "telegram", isPrimary: true },
    });
    const chatId = channel?.telegramChatId?.trim();
    if (!chatId || !env.TELEGRAM_BOT_API_BASE_URL) continue;

    const token = task.lead.leadToken ?? task.leadId;
    const keyboard = {
      inline_keyboard: [
        [
          { text: "Забронировано", callback_data: `R|booked|${token}` },
          { text: "Не состоялось", callback_data: `R|lost|${token}` },
        ],
        [{ text: "В работе", callback_data: `R|progress|${token}` }],
      ],
    };
    const res = await callTelegramJson(env, "sendMessage", {
      chat_id: chatId,
      text: `Сверка MyWave: итог по заявке «${task.lead.program.title}»?`,
      reply_markup: keyboard,
    });
    if (res.ok) {
      sent += 1;
      await prisma.telegramReconciliationTask.update({
        where: { id: task.id },
        data: { status: "sent" },
      });
      await logTelegramPlatformEvent({
        eventName: "reconciliation_requested",
        organizerId: task.organizerId,
        leadToken: task.lead.leadToken ?? undefined,
        properties: { task_id: task.id },
      });
    }
  }
  return { sent };
}
