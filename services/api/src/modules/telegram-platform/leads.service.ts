import { randomBytes } from "crypto";
import type { Env } from "@mywave/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { computeTravelerKeyHash } from "../../lib/travelerKey";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { createDealForBooking } from "../deals/dealService";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { CONSENT_POLICY_VERSION, CONSENT_TEXTS, requiredConsentsForProgram, type RequiredConsentType } from "./consentTexts";
import { logTelegramPlatformEvent } from "./events";
import { hasOrganizerTelegramChat, notifyLeadToOrganizer } from "./notify";

function newLeadToken(): string {
  return randomBytes(16).toString("hex");
}

export type LeadAttemptPayload = {
  guestName?: string;
  phone?: string;
  telegramUsername?: string;
  participantsCount?: number;
  childrenCount?: number;
  comment?: string;
  selectedDate?: string;
};

export async function startLeadAttempt(input: {
  telegramUserId: string;
  programId: string;
  sourceChannel?: string;
  sourcePostId?: string;
  deeplinkPayload?: string;
}) {
  const program = await prisma.program.findUnique({
    where: { id: input.programId },
    select: { id: true, organizerId: true, publishStatus: true },
  });
  if (!program || !isProgramPubliclyVisible(program)) {
    return { ok: false as const, error: "program_not_found" };
  }

  const attempt = await prisma.telegramLeadAttempt.create({
    data: {
      telegramUserId: input.telegramUserId,
      programId: program.id,
      organizerId: program.organizerId,
      status: "started",
      step: "name",
      sourceChannel: input.sourceChannel ?? "telegram_bot",
      sourcePostId: input.sourcePostId ?? null,
      deeplinkPayload: input.deeplinkPayload ?? null,
      payloadJson: {} as Prisma.InputJsonValue,
    },
  });

  const reminderAt2h = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await prisma.telegramAbandonedLead.create({
    data: {
      attemptId: attempt.id,
      telegramUserId: input.telegramUserId,
      reminder2hAt: reminderAt2h,
      reminder24hAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await logTelegramPlatformEvent({
    eventName: "lead_started",
    telegramUserId: input.telegramUserId,
    programId: program.id,
    organizerId: program.organizerId,
    channelPostId: input.sourcePostId ?? null,
    properties: { attempt_id: attempt.id },
  });

  return { ok: true as const, attemptId: attempt.id, step: attempt.step };
}

export async function updateLeadAttemptStep(
  attemptId: string,
  telegramUserId: string,
  step: string,
  patch: LeadAttemptPayload
) {
  const attempt = await prisma.telegramLeadAttempt.findFirst({
    where: { id: attemptId, telegramUserId },
  });
  if (!attempt || attempt.status === "submitted") {
    return { ok: false as const, error: "attempt_not_found" };
  }

  const prev = (attempt.payloadJson as LeadAttemptPayload | null) ?? {};
  const payloadJson = { ...prev, ...patch };

  const updated = await prisma.telegramLeadAttempt.update({
    where: { id: attemptId },
    data: {
      step,
      status: `step_${step}`,
      payloadJson: payloadJson as Prisma.InputJsonValue,
      participantsCount: patch.participantsCount ?? attempt.participantsCount,
      childrenCount: patch.childrenCount ?? attempt.childrenCount,
    },
  });

  await logTelegramPlatformEvent({
    eventName: "lead_step_completed",
    telegramUserId,
    programId: attempt.programId,
    organizerId: attempt.organizerId,
    properties: { attempt_id: attemptId, step },
  });

  return { ok: true as const, attempt: updated, payload: payloadJson };
}

export async function submitTelegramLead(
  env: Env,
  input: {
    attemptId: string;
    telegramUserId: string;
    consents: RequiredConsentType[];
  }
) {
  const attempt = await prisma.telegramLeadAttempt.findFirst({
    where: { id: input.attemptId, telegramUserId: input.telegramUserId },
    include: {
      program: {
        select: {
          id: true,
          organizerId: true,
          title: true,
          publishStatus: true,
          riskLevel: true,
          audienceFit: true,
          organizer: { select: { displayName: true } },
        },
      },
    },
  });
  if (!attempt || attempt.status === "submitted") {
    return { ok: false as const, error: "attempt_not_found" };
  }

  const payload = (attempt.payloadJson as LeadAttemptPayload | null) ?? {};
  if (!payload.guestName?.trim() || !payload.phone?.trim()) {
    return { ok: false as const, error: "incomplete_contact" };
  }

  const isKids =
    (attempt.program.audienceFit ?? "").toLowerCase().includes("дет") ||
    (attempt.program.audienceFit ?? "").toLowerCase().includes("kids");
  const required = requiredConsentsForProgram(attempt.program.riskLevel, isKids);
  const missing = required.filter((c) => !input.consents.includes(c));
  if (missing.length > 0) {
    return { ok: false as const, error: "consent_required", missing };
  }

  const guestContact = [
    `Имя: ${payload.guestName.trim()}`,
    payload.telegramUsername ? `Telegram: @${payload.telegramUsername.replace(/^@/, "")}` : "",
    `Телефон: ${payload.phone.trim()}`,
    payload.participantsCount != null ? `Участников: ${payload.participantsCount}` : "",
    payload.childrenCount != null ? `Детей: ${payload.childrenCount}` : "",
    payload.comment?.trim() ? `Комментарий: ${payload.comment.trim()}` : "",
    payload.selectedDate ? `Дата: ${payload.selectedDate}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const leadToken = newLeadToken();
  const travelerKeyHash = computeTravelerKeyHash(env, guestContact);
  const consentAt = new Date();

  const lead = await prisma.lead.create({
    data: {
      programId: attempt.programId,
      organizerId: attempt.organizerId,
      source: "telegram",
      leadToken,
      telegramUserId: input.telegramUserId,
      sourceChannel: attempt.sourceChannel ?? "telegram_bot",
      sourcePostId: attempt.sourcePostId,
      deeplinkPayload: attempt.deeplinkPayload,
      guestContact,
      travelerKeyHash,
      leadStatus: "new",
      sourceCampaign: attempt.deeplinkPayload ? `deeplink=${attempt.deeplinkPayload}` : null,
    },
  });

  const booking = await prisma.booking.create({
    data: {
      leadId: lead.id,
      programId: attempt.programId,
      organizerId: attempt.organizerId,
      source: "telegram",
      leadToken,
      telegramUserId: input.telegramUserId,
      guestContact,
      travelerKeyHash,
      sourceChannel: attempt.sourceChannel ?? "tg",
      sourceCampaign: lead.sourceCampaign,
      bookingStatus: "created",
      participantsCount: payload.participantsCount ?? null,
      childrenCount: payload.childrenCount ?? null,
      riskAcknowledged: required.includes("high_risk"),
      legalConsentAt: consentAt,
      legalConsentPolicyVersion: CONSENT_POLICY_VERSION,
      notes: payload.comment?.trim() || null,
    },
  });

  await createDealForBooking(booking.id, null);

  for (const consentType of input.consents) {
    await prisma.telegramConsentRecord.create({
      data: {
        telegramUserId: input.telegramUserId,
        consentType,
        textVersion: `${CONSENT_POLICY_VERSION}:${consentType}`,
        source: "bot",
        leadId: lead.id,
        bookingId: booking.id,
      },
    });
  }

  const consentTextSnapshot = input.consents.map((c) => `${c}: ${CONSENT_TEXTS[c]}`).join("\n");
  await prisma.telegramLeadAttempt.update({
    where: { id: attempt.id },
    data: { status: "submitted", submittedLeadId: lead.id, step: "done" },
  });

  await prisma.telegramAbandonedLead.updateMany({
    where: { attemptId: attempt.id },
    data: { status: "closed", closedAt: new Date() },
  });

  const reconDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const organizerHasTelegram = await hasOrganizerTelegramChat(attempt.organizerId);
  const reconComment = organizerHasTelegram
    ? null
    : JSON.stringify({
        requires_ops_followup: true,
        reason: "organizer_telegram_channel_missing",
      });
  await prisma.telegramReconciliationTask.create({
    data: {
      leadId: lead.id,
      organizerId: attempt.organizerId,
      dueAt: reconDue,
      comment: reconComment,
      result: organizerHasTelegram ? null : "requires_ops_followup",
    },
  });

  await logTelegramPlatformEvent({
    eventName: "lead_submitted",
    telegramUserId: input.telegramUserId,
    programId: attempt.programId,
    organizerId: attempt.organizerId,
    leadToken,
    properties: { booking_id: booking.id, lead_id: lead.id },
  });

  const notifyResult = await notifyLeadToOrganizer(env, {
    leadToken,
    programTitle: attempt.program.title,
    organizerName: attempt.program.organizer.displayName,
    organizerId: attempt.organizerId,
    guestContact,
    bookingId: booking.id,
    consentGiven: true,
  });

  if (notifyResult.ok) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { sentToOrganizerAt: new Date() },
    });
    await logTelegramPlatformEvent({
      eventName: "lead_sent_to_organizer",
      telegramUserId: input.telegramUserId,
      programId: attempt.programId,
      organizerId: attempt.organizerId,
      leadToken,
    });
  } else if (notifyResult.routedToOps) {
    await logTelegramPlatformEvent({
      eventName: "lead_routed_to_ops",
      telegramUserId: input.telegramUserId,
      programId: attempt.programId,
      organizerId: attempt.organizerId,
      leadToken,
      properties: { reason: "organizer_telegram_channel_missing", booking_id: booking.id },
    });
  }

  emitBackendAnalyticsEventBestEffort({
    idempotency_key: `tg:lead_submitted:${lead.id}`,
    event_name: "lead_submitted",
    event_version: 1,
    event_source: "backend",
    event_time: new Date().toISOString(),
    program_id: attempt.programId,
    organizer_id: attempt.organizerId,
    lead_id: lead.id,
    booking_id: booking.id,
    traffic_source: "telegram_bot",
    properties_json: { lead_token: leadToken, consent_snapshot_len: consentTextSnapshot.length },
  });

  return {
    ok: true as const,
    leadToken,
    leadId: lead.id,
    bookingId: booking.id,
  };
}

export async function getLeadByToken(leadToken: string, telegramUserId?: string) {
  const lead = await prisma.lead.findUnique({
    where: { leadToken },
    include: {
      program: { select: { id: true, title: true, startDate: true, endDate: true } },
      bookings: { select: { id: true, bookingStatus: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) return null;
  if (telegramUserId && lead.telegramUserId && lead.telegramUserId !== telegramUserId) {
    return null;
  }
  return {
    leadToken: lead.leadToken,
    leadStatus: lead.leadStatus,
    program: lead.program,
    bookingStatus: lead.bookings[0]?.bookingStatus ?? null,
    createdAt: lead.createdAt.toISOString(),
  };
}
