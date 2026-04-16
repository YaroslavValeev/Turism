import { randomBytes } from "crypto";
import { prisma } from "../../lib/prisma";
import type { Booking } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

function buildToken(): string {
  return randomBytes(16).toString("hex");
}

function canSendToContact(contact: string): boolean {
  const v = contact.trim();
  return v.length >= 5;
}

function firstReminderAt(from: Date): Date {
  return new Date(from.getTime() + DAY_MS);
}

function nextReminderAt(from: Date): Date {
  return new Date(from.getTime() + 2 * DAY_MS);
}

export async function ensureReviewRequestForCompletedBooking(booking: Booking): Promise<{
  created: boolean;
  requestId: string;
  status: string;
}> {
  const existing = await prisma.reviewRequest.findUnique({ where: { bookingId: booking.id } });
  if (existing) {
    return { created: false, requestId: existing.id, status: existing.status };
  }

  const hasReview = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (hasReview) {
    const r = await prisma.reviewRequest.create({
      data: {
        bookingId: booking.id,
        organizerId: booking.organizerId,
        programId: booking.programId,
        guestContact: booking.guestContact,
        status: "skipped_review_exists",
        requestToken: buildToken(),
        nextReminderAt: null,
        bookingCompletedAt: booking.completedAt ?? new Date(),
      },
    });
    return { created: true, requestId: r.id, status: r.status };
  }

  const contactOk = canSendToContact(booking.guestContact);
  const now = new Date();
  const request = await prisma.reviewRequest.create({
    data: {
      bookingId: booking.id,
      organizerId: booking.organizerId,
      programId: booking.programId,
      guestContact: booking.guestContact,
      status: contactOk ? "queued" : "skipped_no_contact",
      requestToken: buildToken(),
      nextReminderAt: contactOk ? firstReminderAt(now) : null,
      bookingCompletedAt: booking.completedAt ?? now,
    },
  });
  return { created: true, requestId: request.id, status: request.status };
}

export async function processReviewRequestQueue(limit = 50): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const now = new Date();
  const rows = await prisma.reviewRequest.findMany({
    where: {
      OR: [
        { status: "queued" },
        {
          status: "sent",
          nextReminderAt: { lte: now },
          reminderCount: { lt: 2 },
        },
      ],
    },
    orderBy: { requestedAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const alreadyReviewed = await prisma.review.findUnique({ where: { bookingId: row.bookingId } });
    if (alreadyReviewed) {
      await prisma.reviewRequest.update({
        where: { id: row.id },
        data: {
          status: "skipped_review_exists",
          nextReminderAt: null,
          lastAttemptAt: now,
          lastError: null,
        },
      });
      skipped++;
      continue;
    }
    if (!canSendToContact(row.guestContact)) {
      await prisma.reviewRequest.update({
        where: { id: row.id },
        data: {
          status: "skipped_no_contact",
          nextReminderAt: null,
          lastAttemptAt: now,
          lastError: "invalid_guest_contact",
        },
      });
      skipped++;
      continue;
    }

    try {
      // MVP delivery: фиксируем отправку в очередь/аудит без внешнего провайдера.
      // Интеграция Telegram/Email/SMS может быть подключена поверх этого статуса.
      const isFirstSend = row.firstSentAt == null;
      const nextReminder =
        row.reminderCount + 1 < row.maxReminders ? nextReminderAt(now) : null;
      await prisma.reviewRequest.update({
        where: { id: row.id },
        data: {
          status: "sent",
          firstSentAt: isFirstSend ? now : row.firstSentAt,
          lastSentAt: now,
          reminderCount: row.reminderCount + 1,
          nextReminderAt: nextReminder,
          lastAttemptAt: now,
          lastError: null,
        },
      });
      sent++;
    } catch (e) {
      await prisma.reviewRequest.update({
        where: { id: row.id },
        data: {
          status: "delivery_failed",
          lastAttemptAt: now,
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
      failed++;
    }
  }

  return { processed: rows.length, sent, skipped, failed };
}
