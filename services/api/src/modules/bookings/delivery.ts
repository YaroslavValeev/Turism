import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";

type DeliveryChannel = "telegram_organizer" | "telegram_ops" | "none";

export type BookingDeliveryContext = {
  bookingId: string;
  programId: string;
  programTitle: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  organizerId: string;
  organizerName: string;
  organizerVerificationStatus: string;
  organizerContactEmail: string;
  guestName: string;
  guestContact: string;
  notes: string | null;
  sourceChannel: string | null;
};

function trimText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

async function sendTelegramMessage(env: Env, chatId: string, text: string): Promise<{ ok: boolean; status: number; body: string }> {
  const base = trimText(env.TELEGRAM_BOT_API_BASE_URL);
  if (!base || !chatId) {
    return { ok: false, status: 0, body: "missing telegram base url or chat id" };
  }
  const url = `${base.replace(/\/+$/, "")}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const body = await resp.text().catch(() => "");
  return { ok: resp.ok, status: resp.status, body };
}

function buildLeadMessage(ctx: BookingDeliveryContext): string {
  const location = trimText(ctx.exactLocation) ? `${ctx.region} · ${ctx.exactLocation}` : ctx.region;
  const notes = trimText(ctx.notes);
  return [
    "Новая заявка (MyWave Travel)",
    "",
    `Программа: ${ctx.programTitle}`,
    `Дисциплина: ${ctx.discipline}`,
    `Регион / место: ${location}`,
    "",
    `Организатор: ${ctx.organizerName} (${ctx.organizerVerificationStatus})`,
    `Контакт организатора (email): ${ctx.organizerContactEmail}`,
    "",
    `Гость: ${ctx.guestName}`,
    `Контакт гостя: ${ctx.guestContact}`,
    notes ? `Комментарий: ${notes}` : "Комментарий: —",
    "",
    "Источник: MyWave Travel (платформа). Клиенту нужна поддержка и связь по программе.",
    "",
    `Booking ID: ${ctx.bookingId}`,
    `Program ID: ${ctx.programId}`,
    `Organizer ID: ${ctx.organizerId}`,
    ctx.sourceChannel ? `Source channel: ${ctx.sourceChannel}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function isVerifiedOrganizer(status: string): boolean {
  return status === "verified" || status === "trusted_by_platform";
}

async function hasSignedContract(organizerId: string): Promise<boolean> {
  const signed = await prisma.organizerContract.findFirst({
    where: { organizerId, status: "signed" },
    select: { id: true },
  });
  return Boolean(signed);
}

export async function findExistingDeliveryByIdempotencyKey(idempotencyKey: string): Promise<string | null> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      entityType: "booking_delivery",
      changedField: "idempotency_key",
      oldValue: idempotencyKey,
    },
    orderBy: { createdAt: "desc" },
    select: { newValue: true },
  });
  if (!existing?.newValue) return null;
  try {
    const parsed = JSON.parse(existing.newValue) as { bookingId?: string };
    return typeof parsed.bookingId === "string" ? parsed.bookingId : null;
  } catch {
    return null;
  }
}

export async function findExistingBookingIntakeByStableKey(stableKey: string): Promise<string | null> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      entityType: "booking_intake",
      changedField: "intake_idempotency_key",
      oldValue: stableKey,
    },
    orderBy: { createdAt: "desc" },
    select: { newValue: true },
  });
  if (!existing?.newValue) return null;
  try {
    const parsed = JSON.parse(existing.newValue) as { bookingId?: string };
    return typeof parsed.bookingId === "string" ? parsed.bookingId : null;
  } catch {
    return null;
  }
}

export async function findExistingBookingIntakeByClientIdempotencyKey(clientKey: string): Promise<string | null> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      entityType: "booking_intake",
      changedField: "client_idempotency_key",
      oldValue: clientKey,
    },
    orderBy: { createdAt: "desc" },
    select: { newValue: true },
  });
  if (!existing?.newValue) return null;
  try {
    const parsed = JSON.parse(existing.newValue) as { bookingId?: string };
    return typeof parsed.bookingId === "string" ? parsed.bookingId : null;
  } catch {
    return null;
  }
}

export async function deliverBookingLeadBestEffort(
  env: Env,
  ctx: BookingDeliveryContext,
  idempotencyKey: string,
): Promise<{ channel: DeliveryChannel; ok: boolean; detail: string }> {
  const text = buildLeadMessage(ctx);

  const existingBookingId = await findExistingDeliveryByIdempotencyKey(idempotencyKey);
  if (existingBookingId && existingBookingId !== ctx.bookingId) {
    await writeAuditLog({
      entityType: "booking_delivery",
      entityId: ctx.bookingId,
      changedField: "idempotency_collision",
      oldValue: idempotencyKey,
      newValue: JSON.stringify({ existingBookingId }),
      changedBy: null,
      reason: "idempotency key reused with different booking id",
    });
    return { channel: "none", ok: false, detail: "idempotency_collision" };
  }

  const verified = isVerifiedOrganizer(ctx.organizerVerificationStatus);
  const signed = verified ? await hasSignedContract(ctx.organizerId) : false;
  const organizerChat = trimText(env.TELEGRAM_ORGANIZER_CHAT_ID);
  const opsChat = trimText(env.TELEGRAM_ALERT_CHAT_ID);

  const canTryPrimary =
    env.LEADS_TELEGRAM_PRIMARY_ENABLED && verified && signed && Boolean(organizerChat) && Boolean(trimText(env.TELEGRAM_BOT_API_BASE_URL));

  if (canTryPrimary) {
    const attempt = await sendTelegramMessage(env, organizerChat, text);
    await writeAuditLog({
      entityType: "booking_delivery",
      entityId: ctx.bookingId,
      changedField: "telegram_organizer_attempt",
      oldValue: idempotencyKey,
      newValue: JSON.stringify({ ok: attempt.ok, status: attempt.status }),
      changedBy: null,
      reason: attempt.ok ? "delivered" : "failed",
    });
    if (attempt.ok) {
      await writeAuditLog({
        entityType: "booking_delivery",
        entityId: ctx.bookingId,
        changedField: "idempotency_key",
        oldValue: idempotencyKey,
        newValue: JSON.stringify({ bookingId: ctx.bookingId, channel: "telegram_organizer" }),
        changedBy: null,
        reason: "booking delivery idempotency",
      });
      return { channel: "telegram_organizer", ok: true, detail: "telegram_organizer" };
    }
  }

  if (opsChat) {
    const opsText = [
      "LEAD DELIVERY FALLBACK (ops)",
      "",
      `Reason: ${canTryPrimary ? "primary telegram failed or misconfigured" : "primary telegram not eligible or disabled"}`,
      "",
      text,
    ].join("\n");
    const attempt = await sendTelegramMessage(env, opsChat, opsText);
    await writeAuditLog({
      entityType: "booking_delivery",
      entityId: ctx.bookingId,
      changedField: "telegram_ops_attempt",
      oldValue: idempotencyKey,
      newValue: JSON.stringify({ ok: attempt.ok, status: attempt.status }),
      changedBy: null,
      reason: attempt.ok ? "delivered_ops" : "failed_ops",
    });
    if (attempt.ok) {
      await writeAuditLog({
        entityType: "booking_delivery",
        entityId: ctx.bookingId,
        changedField: "idempotency_key",
        oldValue: idempotencyKey,
        newValue: JSON.stringify({ bookingId: ctx.bookingId, channel: "telegram_ops" }),
        changedBy: null,
        reason: "booking delivery idempotency",
      });
      return { channel: "telegram_ops", ok: true, detail: "telegram_ops" };
    }
  }

  // Last resort: persist as auditable "no external delivery" — ops processes via admin queue.
  await writeAuditLog({
    entityType: "booking_delivery",
    entityId: ctx.bookingId,
    changedField: "delivery_skipped",
    oldValue: idempotencyKey,
    newValue: JSON.stringify({ bookingId: ctx.bookingId, channel: "none" }),
    changedBy: null,
    reason: "no telegram delivery configured; booking remains in admin queue",
  });

  return { channel: "none", ok: false, detail: "no_delivery_channel" };
}
