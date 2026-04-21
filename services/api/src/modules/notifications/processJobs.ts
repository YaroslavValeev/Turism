import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { subscriptionMatchesProgramForEvent } from "./subscriptionMatch";
import { sendNotificationEmail, sendNotificationMax, sendNotificationTelegram } from "./sendChannels";
import type { ProgramDatesUpdatedPayload, ProgramUpcomingStartPayload } from "./enqueueProgramJobs";
import { buildProgramNotificationEmailHtml } from "./notificationProgramEmail";

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

async function countDeliveredTodayUtc(db: PrismaClient, recipientKey: string): Promise<number> {
  const start = utcDayStart(new Date());
  return db.notificationDelivery.count({
    where: { recipientKey, sentAt: { gte: start }, outcome: "delivered" },
  });
}

function recipientKeyForSubscription(sub: {
  channel: string;
  contactEmail: string | null;
  telegramChatId: string | null;
  maxRecipientId: string | null;
}): string | null {
  if (sub.channel === "email" && sub.contactEmail?.trim()) return `email:${sub.contactEmail.trim().toLowerCase()}`;
  if (sub.channel === "telegram" && sub.telegramChatId?.trim()) return `tg:${sub.telegramChatId.trim()}`;
  if (sub.channel === "max" && sub.maxRecipientId?.trim()) return `max:${sub.maxRecipientId.trim()}`;
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function recordDelivery(
  db: PrismaClient,
  row: {
    jobId: string;
    subscriptionId: string;
    recipientChannel: string;
    recipientKey: string;
    eventType: string;
    dedupeKey: string;
    programId: string | null;
    outcome: string;
  },
): Promise<void> {
  await db.notificationDelivery.create({ data: row });
}

async function alreadyDeliveredForJob(
  db: PrismaClient,
  jobId: string,
  subscriptionId: string,
): Promise<boolean> {
  const n = await db.notificationDelivery.count({
    where: { jobId, subscriptionId, outcome: "delivered" },
  });
  return n > 0;
}

async function liveSubscriptionStatus(db: PrismaClient, subscriptionId: string): Promise<string | null> {
  const r = await db.notificationSubscription.findUnique({ where: { id: subscriptionId }, select: { status: true } });
  return r?.status ?? null;
}

async function processOneJob(db: PrismaClient, env: Env, jobId: string): Promise<void> {
  const job = await db.notificationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "processing") return;

  const rateLimit = env.NOTIFICATIONS_RATE_LIMIT_PER_DAY;
  const eventType = job.eventType;
  const payload = job.payload as unknown;

  if (eventType === "program_dates_updated") {
    const p = payload as ProgramDatesUpdatedPayload;
    const program = await db.program.findUnique({
      where: { id: p.programId },
      select: { id: true, title: true, discipline: true, region: true, startDate: true, endDate: true, publishStatus: true },
    });
    if (!program || program.publishStatus !== "published") {
      await db.notificationJob.update({
        where: { id: jobId },
        data: {
          status: "done",
          processedAt: new Date(),
          lastError: null,
          resultCode: "skipped_not_published",
        },
      });
      return;
    }

    const subs = await db.notificationSubscription.findMany({
      where: { status: "active", type: "program_updates" },
    });

    let delivered = 0;
    for (const sub of subs) {
      if (!subscriptionMatchesProgramForEvent(sub.type, eventType, sub.filters, program)) continue;
      const rk = recipientKeyForSubscription(sub);
      if (!rk) continue;
      if (await alreadyDeliveredForJob(db, jobId, sub.id)) {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "skipped_duplicate",
        });
        continue;
      }
      const live = await liveSubscriptionStatus(db, sub.id);
      if (live === "unsubscribed") {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "unsubscribed",
        });
        continue;
      }
      if (live === "pending_confirmation") {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "pending_confirmation",
        });
        continue;
      }
      if ((await countDeliveredTodayUtc(db, rk)) >= rateLimit) {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "skipped_rate_limited",
        });
        continue;
      }

      const subject = "Изменились даты программы";
      const bodyHtml = `
<p>Здравствуйте!</p>
<p>Обновились даты опубликованной программы <strong>${escapeHtml(program.title)}</strong> (${escapeHtml(program.discipline)}, ${escapeHtml(program.region)}).</p>
<p>Было: ${escapeHtml(p.oldStart.slice(0, 10))} — ${escapeHtml(p.oldEnd.slice(0, 10))}<br/>
Стало: ${escapeHtml(p.newStart.slice(0, 10))} — ${escapeHtml(p.newEnd.slice(0, 10))}</p>
<p>Длительность в каталоге пересчитывается автоматически по датам.</p>
<p><small>MyWave Travel · уведомление по подписке «изменения».</small></p>
`.trim();

      const text = `Даты программы «${program.title}» изменились: ${p.oldStart.slice(0, 10)}–${p.oldEnd.slice(0, 10)} → ${p.newStart.slice(0, 10)}–${p.newEnd.slice(0, 10)}.`;

      if (sub.channel === "email" && sub.contactEmail) {
        const html = buildProgramNotificationEmailHtml(env, {
          innerHtml: bodyHtml,
          subscriptionId: sub.id,
          contactEmail: sub.contactEmail,
          programId: program.id,
          jobId,
          eventType,
          dedupeKey: job.dedupeKey,
        });
        const r = await sendNotificationEmail(env, sub.contactEmail, subject, html);
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: "email",
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: r.ok ? "delivered" : "failed",
        });
        if (r.ok) delivered += 1;
      } else if (sub.channel === "telegram" && sub.telegramChatId) {
        const r = await sendNotificationTelegram(env, sub.telegramChatId, text);
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: "telegram",
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: r.ok ? "delivered" : "failed",
        });
        if (r.ok) delivered += 1;
      } else if (sub.channel === "max" && sub.maxRecipientId) {
        const r = await sendNotificationMax(env, sub.maxRecipientId, text);
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: "max",
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: r.ok ? "delivered" : "failed",
        });
        if (r.ok) delivered += 1;
      }
    }

    await db.notificationJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        processedAt: new Date(),
        lastError: delivered === 0 ? "no_recipients_or_all_skipped" : null,
        resultCode: delivered > 0 ? "delivered" : "no_recipients",
      },
    });
    return;
  }

  if (eventType === "program_upcoming_start") {
    const p = payload as ProgramUpcomingStartPayload;
    const program = await db.program.findUnique({
      where: { id: p.programId },
      select: { id: true, title: true, discipline: true, region: true, startDate: true, publishStatus: true },
    });
    if (!program || program.publishStatus !== "published") {
      await db.notificationJob.update({
        where: { id: jobId },
        data: {
          status: "done",
          processedAt: new Date(),
          lastError: null,
          resultCode: "skipped_not_published",
        },
      });
      return;
    }

    const anchor = p.anchorUtcYmd;
    const sd = program.startDate;
    const ymd = `${sd.getUTCFullYear()}-${String(sd.getUTCMonth() + 1).padStart(2, "0")}-${String(sd.getUTCDate()).padStart(2, "0")}`;
    if (ymd !== anchor) {
      await db.notificationJob.update({
        where: { id: jobId },
        data: {
          status: "done",
          processedAt: new Date(),
          lastError: null,
          resultCode: "stale_start_date_skipped",
        },
      });
      return;
    }

    const subs = await db.notificationSubscription.findMany({
      where: { status: "active", type: "seasonal" },
    });

    let delivered = 0;
    const subject = `Скоро старт: ${program.title}`;
    for (const sub of subs) {
      if (!subscriptionMatchesProgramForEvent(sub.type, eventType, sub.filters, program)) continue;
      const rk = recipientKeyForSubscription(sub);
      if (!rk) continue;
      if (await alreadyDeliveredForJob(db, jobId, sub.id)) {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "skipped_duplicate",
        });
        continue;
      }
      const live = await liveSubscriptionStatus(db, sub.id);
      if (live === "unsubscribed") {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "unsubscribed",
        });
        continue;
      }
      if (live === "pending_confirmation") {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "pending_confirmation",
        });
        continue;
      }
      if ((await countDeliveredTodayUtc(db, rk)) >= rateLimit) {
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: sub.channel,
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: "skipped_rate_limited",
        });
        continue;
      }

      const startRu = p.startDate.slice(0, 10);
      const bodyHtml = `
<p>Здравствуйте!</p>
<p>Скоро старт программы <strong>${escapeHtml(program.title)}</strong> (${escapeHtml(program.discipline)}, ${escapeHtml(program.region)}): <strong>${escapeHtml(startRu)}</strong>.</p>
<p>Окно напоминания: за ${p.windowLeadDays} дней до старта (UTC).</p>
<p><small>MyWave Travel · подписка на старты.</small></p>
`.trim();
      const text = `Скоро старт: «${program.title}» — ${startRu} (${program.discipline}, ${program.region}).`;

      if (sub.channel === "email" && sub.contactEmail) {
        const html = buildProgramNotificationEmailHtml(env, {
          innerHtml: bodyHtml,
          subscriptionId: sub.id,
          contactEmail: sub.contactEmail,
          programId: program.id,
          jobId,
          eventType,
          dedupeKey: job.dedupeKey,
        });
        const r = await sendNotificationEmail(env, sub.contactEmail, subject, html);
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: "email",
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: r.ok ? "delivered" : "failed",
        });
        if (r.ok) delivered += 1;
      } else if (sub.channel === "telegram" && sub.telegramChatId) {
        const r = await sendNotificationTelegram(env, sub.telegramChatId, text);
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: "telegram",
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: r.ok ? "delivered" : "failed",
        });
        if (r.ok) delivered += 1;
      } else if (sub.channel === "max" && sub.maxRecipientId) {
        const r = await sendNotificationMax(env, sub.maxRecipientId, text);
        await recordDelivery(db, {
          jobId,
          subscriptionId: sub.id,
          recipientChannel: "max",
          recipientKey: rk,
          eventType,
          dedupeKey: job.dedupeKey,
          programId: program.id,
          outcome: r.ok ? "delivered" : "failed",
        });
        if (r.ok) delivered += 1;
      }
    }

    await db.notificationJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        processedAt: new Date(),
        lastError: delivered === 0 ? "no_recipients_or_all_skipped" : null,
        resultCode: delivered > 0 ? "delivered" : "no_recipients",
      },
    });
    return;
  }

  await db.notificationJob.update({
    where: { id: jobId },
    data: { status: "failed", processedAt: new Date(), lastError: `unknown_event:${eventType}`, resultCode: "failed" },
  });
}

export async function processNotificationsBatch(env: Env, db: PrismaClient, limit: number): Promise<number> {
  if (!env.NOTIFICATIONS_ENABLED) return 0;

  const pending = await db.notificationJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const row of pending) {
    await db.notificationJob.update({
      where: { id: row.id },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    try {
      await processOneJob(db, env, row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const updated = await db.notificationJob.findUnique({ where: { id: row.id }, select: { attempts: true } });
      const attempts = updated?.attempts ?? row.attempts + 1;
      await db.notificationJob.update({
        where: { id: row.id },
        data: {
          status: attempts >= 3 ? "failed" : "pending",
          lastError: msg.slice(0, 2000),
          processedAt: attempts >= 3 ? new Date() : null,
          resultCode: attempts >= 3 ? "failed" : null,
        },
      });
    }
  }

  return pending.length;
}
