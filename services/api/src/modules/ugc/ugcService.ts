import { randomBytes } from "crypto";
import type { Env } from "@mywave/config";
import type { Booking, PrismaClient } from "@prisma/client";
import { notificationTokenSecret } from "../notifications/notificationTokens";
import { sendNotificationEmail } from "../notifications/sendChannels";
import { signUgcSubmitToken } from "./ugcTokens";

function linkBase(env: Env): string {
  return (env.NOTIFICATIONS_LINK_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

function siteBase(env: Env): string {
  return (env.NOTIFICATIONS_SITE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export function extractEmailFromGuestContact(contact: string | null | undefined): string | null {
  if (!contact) return null;
  const m = contact.match(EMAIL_RE);
  return m ? m[0].trim().toLowerCase() : null;
}

function isProgramPublished(status: string): boolean {
  return status === "published";
}

/**
 * Идемпотентно создаёт UGC-request для completed booking.
 * Возвращает { created, requestId, status }. Если booking не completed или program
 * не published — ничего не делает (return null).
 */
export async function ensureUgcRequestForCompletedBooking(
  prisma: PrismaClient,
  booking: Booking,
): Promise<{ created: boolean; requestId: string; status: string } | null> {
  if (booking.bookingStatus !== "completed") return null;

  const existing = await prisma.programUgcRequest.findUnique({ where: { bookingId: booking.id } });
  if (existing) {
    return { created: false, requestId: existing.id, status: existing.status };
  }

  const program = await prisma.program.findUnique({
    where: { id: booking.programId },
    select: { publishStatus: true },
  });
  if (!program || !isProgramPublished(program.publishStatus)) {
    return null;
  }

  const email = extractEmailFromGuestContact(booking.guestContact);
  const token = randomBytes(24).toString("hex");
  const status = email ? "queued" : "skipped_no_email";

  const row = await prisma.programUgcRequest.create({
    data: {
      bookingId: booking.id,
      programId: booking.programId,
      organizerId: booking.organizerId,
      recipientEmail: email,
      status,
      requestToken: token,
      bookingCompletedAt: booking.completedAt ?? new Date(),
    },
  });
  return { created: true, requestId: row.id, status: row.status };
}

function buildRequestEmail(env: Env, params: {
  programTitle: string;
  requestId: string;
  bookingId: string;
  programId: string;
}): { subject: string; html: string } {
  const secret = notificationTokenSecret(env);
  const token = signUgcSubmitToken(secret, {
    requestId: params.requestId,
    bookingId: params.bookingId,
    programId: params.programId,
  });
  const site = siteBase(env);
  const url = `${site}/program/${encodeURIComponent(params.programId)}/ugc?token=${encodeURIComponent(token)}`;
  const subject = `Поездка «${params.programTitle}» — оставьте отзыв`;
  const html = `
<p>Спасибо за участие в поездке <strong>${escapeHtml(params.programTitle)}</strong>.</p>
<p>Нам важно увидеть ваш взгляд: короткий отзыв, рейтинг, фото или видео помогут будущим участникам.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none">Оставить отзыв и медиа</a></p>
<p style="font-size:13px;color:#555">Публикация произойдёт после короткой модерации. Вы контролируете, что появится на карточке программы: мы опубликуем только при вашем явном согласии.</p>
<p><small>Ссылка привязана к вашему бронированию и не подходит никому другому.</small></p>
<p><small>MyWave Travel</small></p>
`;
  return { subject, html };
}

/**
 * Обработка очереди: берёт queued и отправляет email. Без ретраев после первой отправки
 * (MVP: одно письмо). Для delivery_failed админ может поставить status=queued руками.
 */
export async function processUgcRequestQueue(
  prisma: PrismaClient,
  env: Env,
  limit = 50,
): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const rows = await prisma.programUgcRequest.findMany({
    where: { status: "queued" },
    orderBy: { requestedAt: "asc" },
    take: limit,
    include: { program: { select: { title: true, publishStatus: true } } },
  });

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.program || !isProgramPublished(row.program.publishStatus)) {
      await prisma.programUgcRequest.update({
        where: { id: row.id },
        data: { status: "skipped_no_email", lastAttemptAt: now, lastError: "program_not_published" },
      });
      skipped++;
      continue;
    }
    if (!row.recipientEmail) {
      await prisma.programUgcRequest.update({
        where: { id: row.id },
        data: { status: "skipped_no_email", lastAttemptAt: now, lastError: "no_email" },
      });
      skipped++;
      continue;
    }
    const { subject, html } = buildRequestEmail(env, {
      programTitle: row.program.title,
      requestId: row.id,
      bookingId: row.bookingId,
      programId: row.programId,
    });
    const result = await sendNotificationEmail(env, row.recipientEmail, subject, html);
    if (result.ok) {
      const isFirstSend = row.firstSentAt == null;
      await prisma.programUgcRequest.update({
        where: { id: row.id },
        data: {
          status: "sent",
          firstSentAt: isFirstSend ? now : row.firstSentAt,
          lastSentAt: now,
          lastAttemptAt: now,
          lastError: null,
        },
      });
      sent++;
    } else {
      await prisma.programUgcRequest.update({
        where: { id: row.id },
        data: {
          status: "delivery_failed",
          lastAttemptAt: now,
          lastError: result.reason?.slice(0, 500) ?? null,
        },
      });
      failed++;
    }
  }

  return { processed: rows.length, sent, skipped, failed };
}
