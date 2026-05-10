import { randomBytes } from "crypto";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import type { Booking } from "@prisma/client";
import { extractGuestEmail, sendReviewInvitationEmail } from "./reviewRequestMailer";

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

function nextReminderAfterSend(from: Date): Date {
  return new Date(from.getTime() + 2 * DAY_MS);
}

function reviewRequestEmailDisabled(): boolean {
  const v = process.env.REVIEW_REQUEST_EMAIL_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
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
  const guestEmail = extractGuestEmail(booking.guestContact);
  const canQueueEmail = contactOk && !!guestEmail;
  const now = new Date();
  const request = await prisma.reviewRequest.create({
    data: {
      bookingId: booking.id,
      organizerId: booking.organizerId,
      programId: booking.programId,
      guestContact: booking.guestContact,
      status: !contactOk ? "skipped_no_contact" : !guestEmail ? "skipped_no_email" : "queued",
      requestToken: buildToken(),
      nextReminderAt: canQueueEmail ? firstReminderAt(now) : null,
      bookingCompletedAt: booking.completedAt ?? now,
      lastError: contactOk && !guestEmail ? "guest_contact_has_no_email" : null,
    },
  });
  return { created: true, requestId: request.id, status: request.status };
}

export async function processReviewRequestQueue(env: Env, limit = 50): Promise<{
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
    include: {
      program: { select: { title: true } },
      organizer: { select: { displayName: true } },
    },
  });

  const webBase = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  const skipRealEmail = reviewRequestEmailDisabled();

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

    const guestEmail = extractGuestEmail(row.guestContact);
    if (!guestEmail) {
      await prisma.reviewRequest.update({
        where: { id: row.id },
        data: {
          status: "skipped_no_email",
          nextReminderAt: null,
          lastAttemptAt: now,
          lastError: "guest_contact_has_no_email",
        },
      });
      skipped++;
      continue;
    }

    try {
      const reviewUrl = `${webBase}/review/${encodeURIComponent(row.requestToken)}`;
      const isReminder = row.status === "sent" && row.firstSentAt != null;

      if (!skipRealEmail) {
        const mail = await sendReviewInvitationEmail(env, {
          to: guestEmail,
          reviewUrl,
          programTitle: row.program.title,
          organizerName: row.organizer.displayName,
          isReminder,
        });
        if (!mail.ok) {
          if (mail.reason === "staging_allowlist") {
            await prisma.reviewRequest.update({
              where: { id: row.id },
              data: {
                status: "skipped_staging_allowlist",
                nextReminderAt: null,
                lastAttemptAt: now,
                lastError: "email_not_in_EMAIL_STAGING_ALLOWLIST",
              },
            });
            skipped++;
            continue;
          }
          if (mail.reason === "no_smtp") {
            await prisma.reviewRequest.update({
              where: { id: row.id },
              data: {
                lastAttemptAt: now,
                lastError: "smtp_not_configured",
              },
            });
            failed++;
            continue;
          }
          await prisma.reviewRequest.update({
            where: { id: row.id },
            data: {
              status: "delivery_failed",
              lastAttemptAt: now,
              lastError: "email_send_failed",
            },
          });
          failed++;
          continue;
        }
      }

      const isFirstSend = row.firstSentAt == null;
      const nextReminder =
        row.reminderCount + 1 < row.maxReminders ? nextReminderAfterSend(now) : null;
      await prisma.reviewRequest.update({
        where: { id: row.id },
        data: {
          status: "sent",
          firstSentAt: isFirstSend ? now : row.firstSentAt,
          lastSentAt: now,
          reminderCount: row.reminderCount + 1,
          nextReminderAt: nextReminder,
          lastAttemptAt: now,
          lastError: skipRealEmail ? "REVIEW_REQUEST_EMAIL_DISABLED" : null,
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
