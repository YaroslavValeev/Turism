import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";
import { isLaunchMode } from "@mywave/config";
import { writeAuditLog } from "../../../lib/audit";
import { emitBackendAnalyticsEventBestEffort } from "../../analytics/service";
import { deliverConversionCustomMessage } from "../deliver";
import { subjectForStage } from "../messages";
import type { ProgramConversionMetrics } from "../metrics";
import { isOrganizerConversionCooldownActive } from "../organizerCooldown";
import { isConversionStageAutomationAllowed } from "../rolloutPolicy";
import { CONVERSION_DRAFT_STATUS, draftDedupeKey, isOwnerGovernanceStage } from "./constants";
import { answerTelegramCallbackQuery, sendOwnerConversionDraftTelegram, type OwnerDraftPreview } from "./ownerTelegram";

type OrganizerRow = { contactEmail: string; telegramChatId: string | null; displayName: string };

function organizerDisplayLabel(org: { displayName: string | null; contactEmail: string }): string {
  const d = org.displayName?.trim();
  return d || org.contactEmail;
}

function plannedChannel(org: OrganizerRow): "telegram" | "email" {
  return (org.telegramChatId ?? "").trim() ? "telegram" : "email";
}

function metricsLine(m: ProgramConversionMetrics): string {
  return `views=${m.views}, clicks=${m.clicks}, leads=${m.leads}, deals=${m.deals}`;
}

async function emitThreshold(programId: string, organizerId: string, stage: number, metrics: ProgramConversionMetrics) {
  emitBackendAnalyticsEventBestEffort({
    event_name: "value_threshold_reached",
    event_version: 1,
    event_source: "system",
    event_time: new Date().toISOString(),
    idempotency_key: `value_threshold_reached:${programId}:stage:${stage}`,
    program_id: programId,
    organizer_id: organizerId,
    properties_json: {
      stage,
      views: metrics.views,
      clicks: metrics.clicks,
      leads: metrics.leads,
      deals: metrics.deals,
    },
  });
}

async function emitStageSent(programId: string, organizerId: string, stage: number, channel: string, dedupeKey: string) {
  emitBackendAnalyticsEventBestEffort({
    event_name: "organizer_conversion_stage_sent",
    event_version: 1,
    event_source: "system",
    event_time: new Date().toISOString(),
    idempotency_key: `organizer_conversion_stage_sent:${dedupeKey}`,
    program_id: programId,
    organizer_id: organizerId,
    properties_json: { stage, channel },
  });
}

function buildStatePatchForStage(
  stage: number,
  row: { maxStageReached: number },
  now: Date,
  env: Env,
): Prisma.ProgramConversionStateUpdateInput {
  const max = Math.max(row.maxStageReached, stage);
  if (stage === 3) {
    const delayMs = env.CONVERSION_STAGE4_DELAY_HOURS * 3600 * 1000;
    return {
      stage3SentAt: now,
      maxStageReached: max,
      stage4EligibleAt: new Date(now.getTime() + delayMs),
    };
  }
  if (stage === 4) {
    return { stage4SentAt: now, maxStageReached: max };
  }
  return { stage5SentAt: now, maxStageReached: max };
}

export async function ensureOwnerApprovalDraft(params: {
  db: PrismaClient;
  env: Env;
  stage: number;
  programId: string;
  organizerId: string;
  organizer: OrganizerRow;
  programTitle: string;
  messageText: string;
  metrics: ProgramConversionMetrics;
  now: Date;
}): Promise<void> {
  const { db, env, stage, programId, organizerId, organizer, programTitle, messageText, metrics, now } = params;
  if (!isOwnerGovernanceStage(stage)) return;
  if (!isConversionStageAutomationAllowed(env, stage)) return;

  const dedupe = draftDedupeKey(programId, stage);
  const existing = await db.conversionMessageDraft.findUnique({ where: { dedupeKey: dedupe } });

  if (existing?.status === CONVERSION_DRAFT_STATUS.REJECTED) return;
  if (existing?.status === CONVERSION_DRAFT_STATUS.SENT) return;

  if (existing?.status === CONVERSION_DRAFT_STATUS.DEFERRED) {
    if (existing.deferredUntil && existing.deferredUntil.getTime() > now.getTime()) return;
    await db.conversionMessageDraft.update({
      where: { id: existing.id },
      data: {
        status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
        deferredUntil: null,
        ownerNotifiedAt: null,
      },
    });
    const reopened = await db.conversionMessageDraft.findUniqueOrThrow({ where: { id: existing.id } });
    await notifyOwnerForDraft(env, db, reopened, organizer, programTitle, metrics);
    return;
  }

  if (
    existing &&
    (existing.status === CONVERSION_DRAFT_STATUS.AWAITING_OWNER ||
      existing.status === CONVERSION_DRAFT_STATUS.EDITED ||
      existing.status === CONVERSION_DRAFT_STATUS.APPROVED)
  ) {
    if (!existing.ownerNotifiedAt) {
      await notifyOwnerForDraft(env, db, existing, organizer, programTitle, metrics);
    }
    return;
  }

  if (existing) return;

  const ttlMs = Math.max(1, env.CONVERSION_OWNER_APPROVAL_TTL_HOURS) * 3600 * 1000;
  const draft = await db.conversionMessageDraft.create({
    data: {
      id: randomUUID(),
      organizerId,
      programId,
      stage,
      metricsSnapshotJson: metrics as unknown as Prisma.InputJsonValue,
      channel: plannedChannel(organizer),
      messageText,
      status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
      dedupeKey: dedupe,
      expiresAt: new Date(now.getTime() + ttlMs),
    },
  });

  await writeAuditLog({
    entityType: "ConversionMessageDraft",
    entityId: draft.id,
    changedField: "draft_created",
    oldValue: null,
    newValue: JSON.stringify({ programId, stage, dedupe }),
    changedBy: "system",
    reason: "owner_approval_required",
  });

  await notifyOwnerForDraft(env, db, draft, organizer, programTitle, metrics);
}

/** Экспорт для admin UI / reopen — повторное уведомление owner в Telegram. */
export async function notifyOwnerForDraft(
  env: Env,
  db: PrismaClient,
  draft: { id: string; messageText: string; stage: number; channel: string },
  organizer: OrganizerRow,
  programTitle: string,
  metrics: ProgramConversionMetrics,
): Promise<void> {
  const metricsSnap = metricsLine(metrics);
  const previewText =
    draft.messageText.length > 2800 ? `${draft.messageText.slice(0, 2800)}\n…(см. PATCH /admin/conversion-drafts/${draft.id})` : draft.messageText;

  const preview: OwnerDraftPreview = {
    draftId: draft.id,
    organizerName: organizerDisplayLabel(organizer),
    programTitle,
    stage: draft.stage,
    plannedChannel: draft.channel,
    metricsLine: metricsSnap,
    messagePreview: previewText,
  };

  const r = await sendOwnerConversionDraftTelegram(env, preview);
  const now = new Date();
  const errSnippet = r.ok ? null : (r.reason ?? "telegram_failed").slice(0, 512);
  await db.conversionMessageDraft.update({
    where: { id: draft.id },
    data: {
      ownerNotifyLastAttemptAt: now,
      ownerNotifyLastError: errSnippet,
      ownerNotifiedAt: r.ok ? now : null,
    },
  });
}

export async function reopenDeferredConversionDrafts(db: PrismaClient, env: Env, now: Date): Promise<number> {
  const due = await db.conversionMessageDraft.findMany({
    where: {
      status: CONVERSION_DRAFT_STATUS.DEFERRED,
      deferredUntil: { lte: now },
    },
    include: {
      organizer: { select: { contactEmail: true, telegramChatId: true, displayName: true } },
      program: { select: { title: true } },
    },
  });
  let n = 0;
  for (const d of due) {
    // eslint-disable-next-line no-await-in-loop
    await db.conversionMessageDraft.update({
      where: { id: d.id },
      data: {
        status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
        deferredUntil: null,
        ownerNotifiedAt: null,
      },
    });
    const fresh = await db.conversionMessageDraft.findUniqueOrThrow({ where: { id: d.id } });
    const m = d.metricsSnapshotJson as unknown as ProgramConversionMetrics;
    // eslint-disable-next-line no-await-in-loop
    await notifyOwnerForDraft(env, db, fresh, d.organizer, d.program.title, m);
    n += 1;
  }
  return n;
}

function parseCallbackData(data: string): { action: string; draftId: string } | null {
  const m = /^(send|rewrite|reject|defer)_draft:(.+)$/.exec(data.trim());
  if (!m) return null;
  return { action: m[1], draftId: m[2] };
}

export async function handleConversionTelegramWebhook(
  db: PrismaClient,
  env: Env,
  body: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const b = body as {
    callback_query?: { id: string; data?: string; from?: { id: number; username?: string } };
  };
  const cq = b.callback_query;
  if (!cq?.id || !cq.data) return { ok: true };

  const parsed = parseCallbackData(cq.data);
  if (!parsed) {
    await answerTelegramCallbackQuery(env, cq.id, "Неизвестная команда");
    return { ok: false, error: "bad_callback" };
  }

  const reviewedBy = cq.from?.username ? `tg:${cq.from.username}` : `tg:${cq.from?.id ?? "unknown"}`;

  if (parsed.action === "rewrite") {
    await answerTelegramCallbackQuery(
      env,
      cq.id,
      `Правка текста: PATCH /admin/conversion-drafts/${parsed.draftId} с телом {"messageText":"..."}`,
      true,
    );
    const d = await db.conversionMessageDraft.findUnique({ where: { id: parsed.draftId } });
    if (
      d &&
      (d.status === CONVERSION_DRAFT_STATUS.AWAITING_OWNER ||
        d.status === CONVERSION_DRAFT_STATUS.EDITED ||
        d.status === CONVERSION_DRAFT_STATUS.DEFERRED)
    ) {
      await db.conversionMessageDraft.update({
        where: { id: d.id },
        data: {
          status: CONVERSION_DRAFT_STATUS.EDITED,
          reviewedAt: new Date(),
          reviewedBy,
        },
      });
      await writeAuditLog({
        entityType: "ConversionMessageDraft",
        entityId: d.id,
        changedField: "owner_rewrite",
        oldValue: d.status,
        newValue: CONVERSION_DRAFT_STATUS.EDITED,
        changedBy: reviewedBy,
      });
    }
    return { ok: true };
  }

  if (parsed.action === "reject") {
    const d = await db.conversionMessageDraft.findUnique({ where: { id: parsed.draftId } });
    if (!d) {
      await answerTelegramCallbackQuery(env, cq.id, "Черновик не найден", true);
      return { ok: false, error: "not_found" };
    }
    if (
      d.status !== CONVERSION_DRAFT_STATUS.AWAITING_OWNER &&
      d.status !== CONVERSION_DRAFT_STATUS.EDITED &&
      d.status !== CONVERSION_DRAFT_STATUS.DEFERRED
    ) {
      await answerTelegramCallbackQuery(env, cq.id, "Уже обработан", true);
      return { ok: false, error: "bad_state" };
    }
    await db.conversionMessageDraft.update({
      where: { id: d.id },
      data: {
        status: CONVERSION_DRAFT_STATUS.REJECTED,
        reviewedAt: new Date(),
        reviewedBy,
      },
    });
    await writeAuditLog({
      entityType: "ConversionMessageDraft",
      entityId: d.id,
      changedField: "owner_reject",
      oldValue: d.status,
      newValue: CONVERSION_DRAFT_STATUS.REJECTED,
      changedBy: reviewedBy,
    });
    await answerTelegramCallbackQuery(env, cq.id, "Отклонено");
    return { ok: true };
  }

  if (parsed.action === "defer") {
    const d = await db.conversionMessageDraft.findUnique({ where: { id: parsed.draftId } });
    if (!d) {
      await answerTelegramCallbackQuery(env, cq.id, "Черновик не найден", true);
      return { ok: false, error: "not_found" };
    }
    if (d.status === CONVERSION_DRAFT_STATUS.DEFERRED && d.deferredUntil && d.deferredUntil.getTime() > Date.now()) {
      await answerTelegramCallbackQuery(env, cq.id, "Уже отложено", true);
      return { ok: false, error: "already_deferred" };
    }
    if (
      d.status !== CONVERSION_DRAFT_STATUS.AWAITING_OWNER &&
      d.status !== CONVERSION_DRAFT_STATUS.EDITED &&
      d.status !== CONVERSION_DRAFT_STATUS.DEFERRED
    ) {
      await answerTelegramCallbackQuery(env, cq.id, "Уже обработан", true);
      return { ok: false, error: "bad_state" };
    }
    const deferMs = Math.max(1, env.CONVERSION_OWNER_DEFER_HOURS) * 3600 * 1000;
    const until = new Date(Date.now() + deferMs);
    await db.conversionMessageDraft.update({
      where: { id: d.id },
      data: {
        status: CONVERSION_DRAFT_STATUS.DEFERRED,
        deferredUntil: until,
        reviewedAt: new Date(),
        reviewedBy,
      },
    });
    await writeAuditLog({
      entityType: "ConversionMessageDraft",
      entityId: d.id,
      changedField: "owner_defer",
      oldValue: d.status,
      newValue: `${CONVERSION_DRAFT_STATUS.DEFERRED}:${until.toISOString()}`,
      changedBy: reviewedBy,
    });
    await answerTelegramCallbackQuery(env, cq.id, `Отложено до ${until.toISOString()}`);
    return { ok: true };
  }

  if (parsed.action === "send") {
    const r = await applyOwnerApprovedSend(db, env, parsed.draftId, reviewedBy);
    await answerTelegramCallbackQuery(env, cq.id, r.ok ? "Отправлено организатору" : (r.error ?? "Ошибка"), !r.ok);
    return r;
  }

  return { ok: true };
}

export async function applyOwnerApprovedSend(
  db: PrismaClient,
  env: Env,
  draftId: string,
  reviewedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const draft = await db.conversionMessageDraft.findUnique({
    where: { id: draftId },
    include: {
      organizer: { select: { contactEmail: true, telegramChatId: true, displayName: true } },
      program: { select: { title: true, publishStatus: true } },
    },
  });
  if (!draft) return { ok: false, error: "draft_not_found" };
  if (
    draft.status !== CONVERSION_DRAFT_STATUS.AWAITING_OWNER &&
    draft.status !== CONVERSION_DRAFT_STATUS.EDITED
  ) {
    return { ok: false, error: "invalid_status" };
  }
  if (draft.program.publishStatus !== "published") {
    return { ok: false, error: "program_not_published" };
  }

  const state = await db.programConversionState.findUnique({ where: { programId: draft.programId } });
  if (!state) return { ok: false, error: "no_conversion_state" };
  if (!state.serviceCommsOptIn) return { ok: false, error: "opt_out" };

  const now = new Date();
  if (await isOrganizerConversionCooldownActive(db, draft.organizerId, env, now)) {
    return { ok: false, error: "organizer_cooldown" };
  }

  const deliveryDedupe = `conversion:${draft.programId}:stage:${draft.stage}`;
  const existingDelivery = await db.programConversionDelivery.findUnique({ where: { dedupeKey: deliveryDedupe } });
  if (existingDelivery?.outcome.startsWith("delivered")) {
    await db.conversionMessageDraft.update({
      where: { id: draft.id },
      data: { status: CONVERSION_DRAFT_STATUS.SENT, sentAt: existingDelivery.sentAt, reviewedAt: now, reviewedBy },
    });
    return { ok: true };
  }

  const subject = subjectForStage(draft.stage, draft.program.title, isLaunchMode(env.PLATFORM_MODE));
  const result = await deliverConversionCustomMessage(env, {
    toEmail: draft.organizer.contactEmail,
    telegramChatId: draft.organizer.telegramChatId,
    subject,
    plainBody: draft.messageText,
  });

  if (!result.ok) {
    await writeAuditLog({
      entityType: "ConversionMessageDraft",
      entityId: draft.id,
      changedField: "owner_send_failed",
      oldValue: draft.status,
      newValue: result.reason ?? "delivery_failed",
      changedBy: reviewedBy,
    });
    return { ok: false, error: result.reason ?? "delivery_failed" };
  }

  const metrics = draft.metricsSnapshotJson as unknown as ProgramConversionMetrics;
  const statePatch = buildStatePatchForStage(draft.stage, state, now, env);

  await db.$transaction([
    db.programConversionDelivery.upsert({
      where: { dedupeKey: deliveryDedupe },
      create: {
        id: randomUUID(),
        programId: draft.programId,
        organizerId: draft.organizerId,
        stage: draft.stage,
        channel: result.channel,
        dedupeKey: deliveryDedupe,
        outcome: `delivered_${result.channel}`,
      },
      update: { channel: result.channel, outcome: `delivered_${result.channel}` },
    }),
    db.programConversionState.update({
      where: { id: state.id },
      data: statePatch,
    }),
    db.conversionMessageDraft.update({
      where: { id: draft.id },
      data: {
        status: CONVERSION_DRAFT_STATUS.SENT,
        sentAt: now,
        reviewedAt: now,
        reviewedBy,
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "ConversionMessageDraft",
    entityId: draft.id,
    changedField: "owner_send",
    oldValue: draft.status,
    newValue: CONVERSION_DRAFT_STATUS.SENT,
    changedBy: reviewedBy,
    reason: result.channel,
  });

  await emitThreshold(draft.programId, draft.organizerId, draft.stage, metrics);
  await emitStageSent(draft.programId, draft.organizerId, draft.stage, result.channel, deliveryDedupe);

  console.log(
    "[conversion-funnel] owner-approved delivered",
    JSON.stringify({ organizerId: draft.organizerId, programId: draft.programId, stage: draft.stage, channel: result.channel }),
  );

  return { ok: true };
}

export async function adminRejectDraft(
  db: PrismaClient,
  draftId: string,
  reviewedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const d = await db.conversionMessageDraft.findUnique({ where: { id: draftId } });
  if (!d) return { ok: false, error: "draft_not_found" };
  if (
    d.status !== CONVERSION_DRAFT_STATUS.AWAITING_OWNER &&
    d.status !== CONVERSION_DRAFT_STATUS.EDITED &&
    d.status !== CONVERSION_DRAFT_STATUS.DEFERRED
  ) {
    return { ok: false, error: "invalid_status" };
  }
  await db.conversionMessageDraft.update({
    where: { id: d.id },
    data: {
      status: CONVERSION_DRAFT_STATUS.REJECTED,
      reviewedAt: new Date(),
      reviewedBy,
    },
  });
  await writeAuditLog({
    entityType: "ConversionMessageDraft",
    entityId: d.id,
    changedField: "admin_reject",
    oldValue: d.status,
    newValue: CONVERSION_DRAFT_STATUS.REJECTED,
    changedBy: reviewedBy,
  });
  return { ok: true };
}

export async function adminDeferDraft(
  db: PrismaClient,
  draftId: string,
  reviewedBy: string,
  deferHours: number,
): Promise<{ ok: boolean; error?: string; deferredUntil?: string }> {
  const d = await db.conversionMessageDraft.findUnique({ where: { id: draftId } });
  if (!d) return { ok: false, error: "draft_not_found" };
  if (
    d.status !== CONVERSION_DRAFT_STATUS.AWAITING_OWNER &&
    d.status !== CONVERSION_DRAFT_STATUS.EDITED &&
    d.status !== CONVERSION_DRAFT_STATUS.DEFERRED
  ) {
    return { ok: false, error: "invalid_status" };
  }
  const h = Math.max(1, Math.min(168, deferHours));
  const until = new Date(Date.now() + h * 3600 * 1000);
  await db.conversionMessageDraft.update({
    where: { id: d.id },
    data: {
      status: CONVERSION_DRAFT_STATUS.DEFERRED,
      deferredUntil: until,
      reviewedAt: new Date(),
      reviewedBy,
    },
  });
  await writeAuditLog({
    entityType: "ConversionMessageDraft",
    entityId: d.id,
    changedField: "admin_defer",
    oldValue: d.status,
    newValue: `${CONVERSION_DRAFT_STATUS.DEFERRED}:${until.toISOString()}`,
    changedBy: reviewedBy,
  });
  return { ok: true, deferredUntil: until.toISOString() };
}

/** Вернуть в очередь после reject или defer (повторное решение). */
export async function adminReopenDraft(
  db: PrismaClient,
  env: Env,
  draftId: string,
  reviewedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const d = await db.conversionMessageDraft.findUnique({
    where: { id: draftId },
    include: {
      organizer: { select: { contactEmail: true, telegramChatId: true, displayName: true } },
      program: { select: { title: true } },
    },
  });
  if (!d) return { ok: false, error: "draft_not_found" };
  if (d.status !== CONVERSION_DRAFT_STATUS.REJECTED && d.status !== CONVERSION_DRAFT_STATUS.DEFERRED) {
    return { ok: false, error: "reopen_only_rejected_or_deferred" };
  }

  await db.conversionMessageDraft.update({
    where: { id: d.id },
    data: {
      status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
      deferredUntil: null,
      ownerNotifiedAt: null,
      reviewedAt: new Date(),
      reviewedBy,
    },
  });
  await writeAuditLog({
    entityType: "ConversionMessageDraft",
    entityId: d.id,
    changedField: "admin_reopen",
    oldValue: d.status,
    newValue: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
    changedBy: reviewedBy,
  });

  const m = d.metricsSnapshotJson as unknown as ProgramConversionMetrics;
  const fresh = await db.conversionMessageDraft.findUniqueOrThrow({ where: { id: d.id } });
  await notifyOwnerForDraft(env, db, fresh, d.organizer, d.program.title, m);
  return { ok: true };
}

/** Повторная попытка уведомления owner (Telegram) по существующему черновику. */
export async function adminRetryOwnerNotifyForDraft(
  env: Env,
  db: PrismaClient,
  draftId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = await db.conversionMessageDraft.findUnique({
    where: { id: draftId },
    include: {
      organizer: { select: { contactEmail: true, telegramChatId: true, displayName: true } },
      program: { select: { title: true } },
    },
  });
  if (!d) return { ok: false, error: "draft_not_found" };
  const m = d.metricsSnapshotJson as unknown as ProgramConversionMetrics;
  await notifyOwnerForDraft(env, db, d, d.organizer, d.program.title, m);
  return { ok: true };
}
