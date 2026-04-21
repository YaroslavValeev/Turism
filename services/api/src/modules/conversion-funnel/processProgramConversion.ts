import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";
import { isLaunchMode } from "@mywave/config";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { buildProgramConversionMetrics, type ProgramConversionMetrics } from "./metrics";
import { buildConversionUnsubscribeUrl, deliverConversionMessage } from "./deliver";
import { buildFollowUpPlain, buildHtmlForStage, buildPlainTextForStage, subjectForStage } from "./messages";
import type { ProgramConversionStateSlice } from "./rules";
import * as rules from "./rules";
import { isOrganizerConversionCooldownActive } from "./organizerCooldown";
import { isConversionStageAutomationAllowed } from "./rolloutPolicy";
import { ensureOwnerApprovalDraft } from "./drafts/draftService";

function commissionLabelFromBps(bps: number): string {
  const x = bps / 100;
  return `${Number.isInteger(x) ? x : x.toFixed(1)}%`;
}

type Ctx = Parameters<typeof buildPlainTextForStage>[1];

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

async function emitFollowupSent(programId: string, organizerId: string, dedupeKey: string) {
  emitBackendAnalyticsEventBestEffort({
    event_name: "organizer_conversion_followup_sent",
    event_version: 1,
    event_source: "system",
    event_time: new Date().toISOString(),
    idempotency_key: `organizer_conversion_followup_sent:${dedupeKey}`,
    program_id: programId,
    organizer_id: organizerId,
  });
}

type OrganizerSlice = {
  contactEmail: string;
  telegramChatId: string | null;
};

async function trySendStage(
  db: PrismaClient,
  env: Env,
  stateId: string,
  programId: string,
  organizerId: string,
  organizer: OrganizerSlice,
  stage: number,
  ctx: Ctx,
  metrics: ProgramConversionMetrics,
  now: Date,
  buildPatch: () => Record<string, Date | number>,
): Promise<void> {
  if (!isConversionStageAutomationAllowed(env, stage)) return;

  const dedupeKey = `conversion:${programId}:stage:${stage}`;
  const existing = await db.programConversionDelivery.findUnique({ where: { dedupeKey } });
  if (existing?.outcome.startsWith("delivered")) return;

  if (await isOrganizerConversionCooldownActive(db, organizerId, env, now)) {
    console.log(
      "[conversion-funnel] suppressed",
      JSON.stringify({ reason: "organizer_rate_limit", organizerId, programId, stage }),
    );
    return;
  }

  const plain = buildPlainTextForStage(stage, ctx);
  const html = buildHtmlForStage(stage, ctx);
  const subject = subjectForStage(stage, ctx.programTitle, ctx.launchMode);

  const result = await deliverConversionMessage(env, {
    toEmail: organizer.contactEmail,
    telegramChatId: organizer.telegramChatId,
    subject,
    htmlBody: html,
    plainBody: plain,
  });

  if (!result.ok) {
    await db.programConversionDelivery.upsert({
      where: { dedupeKey },
      create: {
        id: randomUUID(),
        programId,
        organizerId,
        stage,
        channel: "none",
        dedupeKey,
        outcome: `failed:${result.reason ?? "unknown"}`,
      },
      update: { outcome: `failed:${result.reason ?? "unknown"}`, channel: "none" },
    });
    return;
  }

  const patch = buildPatch();
  await db.$transaction([
    db.programConversionDelivery.upsert({
      where: { dedupeKey },
      create: {
        id: randomUUID(),
        programId,
        organizerId,
        stage,
        channel: result.channel,
        dedupeKey,
        outcome: `delivered_${result.channel}`,
      },
      update: { channel: result.channel, outcome: `delivered_${result.channel}` },
    }),
    db.programConversionState.update({
      where: { id: stateId },
      data: patch,
    }),
  ]);

  console.log(
    "[conversion-funnel] delivered",
    JSON.stringify({ organizerId, programId, stage, channel: result.channel }),
  );

  await emitThreshold(programId, organizerId, stage, metrics);
  await emitStageSent(programId, organizerId, stage, result.channel, dedupeKey);
}

async function sendFollowUp(
  db: PrismaClient,
  env: Env,
  stateId: string,
  programId: string,
  organizerId: string,
  organizer: OrganizerSlice,
  ctx: Ctx,
  now: Date,
): Promise<void> {
  if (!isConversionStageAutomationAllowed(env, -1)) return;

  const dedupeKey = `conversion:${programId}:followup`;
  const existing = await db.programConversionDelivery.findUnique({ where: { dedupeKey } });
  if (existing?.outcome.startsWith("delivered")) return;

  if (await isOrganizerConversionCooldownActive(db, organizerId, env, now)) {
    console.log(
      "[conversion-funnel] suppressed",
      JSON.stringify({ reason: "organizer_rate_limit", organizerId, programId, stage: -1 }),
    );
    return;
  }

  const plain = buildFollowUpPlain(ctx);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif">${plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\n/g, "<br/>")}</body></html>`;
  const shortTitle =
    ctx.programTitle.length > 40 ? `${ctx.programTitle.slice(0, 37)}…` : ctx.programTitle;
  const subject = `MyWave: как дела с заявками — «${shortTitle}»`;

  const result = await deliverConversionMessage(env, {
    toEmail: organizer.contactEmail,
    telegramChatId: organizer.telegramChatId,
    subject,
    htmlBody: html,
    plainBody: plain,
  });

  if (!result.ok) {
    await db.programConversionDelivery.upsert({
      where: { dedupeKey },
      create: {
        id: randomUUID(),
        programId,
        organizerId,
        stage: -1,
        channel: "none",
        dedupeKey,
        outcome: `failed:${result.reason ?? "unknown"}`,
      },
      update: { outcome: `failed:${result.reason ?? "unknown"}`, channel: "none" },
    });
    return;
  }

  await db.$transaction([
    db.programConversionDelivery.upsert({
      where: { dedupeKey },
      create: {
        id: randomUUID(),
        programId,
        organizerId,
        stage: -1,
        channel: result.channel,
        dedupeKey,
        outcome: `delivered_${result.channel}`,
      },
      update: { channel: result.channel, outcome: `delivered_${result.channel}` },
    }),
    db.programConversionState.update({
      where: { id: stateId },
      data: { followUpSentAt: now },
    }),
  ]);

  console.log(
    "[conversion-funnel] delivered",
    JSON.stringify({ organizerId, programId, stage: -1, channel: result.channel }),
  );

  await emitFollowupSent(programId, organizerId, dedupeKey);
}

export async function processOneProgramConversion(db: PrismaClient, env: Env, programId: string): Promise<void> {
  if (!env.CONVERSION_FUNNEL_ENABLED) return;

  const row = await db.programConversionState.findUnique({
    where: { programId },
    include: {
      program: { select: { id: true, title: true, publishStatus: true } },
      organizer: { select: { contactEmail: true, telegramChatId: true, displayName: true, commissionRateBps: true } },
    },
  });
  if (!row || row.program.publishStatus !== "published") return;
  if (!row.serviceCommsOptIn) return;

  const now = new Date();
  const metrics = await buildProgramConversionMetrics(db, {
    programId,
    organizerId: row.organizerId,
    since: row.firstPublishedAt,
    now,
  });

  const stateSlice: ProgramConversionStateSlice = {
    stage0SentAt: row.stage0SentAt,
    stage1SentAt: row.stage1SentAt,
    stage2SentAt: row.stage2SentAt,
    stage3SentAt: row.stage3SentAt,
    stage4SentAt: row.stage4SentAt,
    stage5SentAt: row.stage5SentAt,
    stage4EligibleAt: row.stage4EligibleAt,
    followUpDueAt: row.followUpDueAt,
    followUpSentAt: row.followUpSentAt,
  };

  const ctx: Ctx = {
    programTitle: row.program.title,
    commissionPctLabel: commissionLabelFromBps(row.organizer.commissionRateBps),
    metrics: { views: metrics.views, clicks: metrics.clicks, leads: metrics.leads, deals: metrics.deals },
    discussUrl: env.CONVERSION_DISCUSS_URL,
    unsubscribeUrl: buildConversionUnsubscribeUrl(env, programId),
    launchMode: isLaunchMode(env.PLATFORM_MODE),
  };

  if (rules.shouldSendFollowUp(stateSlice, now) && row.stage2SentAt) {
    await sendFollowUp(db, env, row.id, programId, row.organizerId, row.organizer, ctx, now);
    return;
  }

  if (!row.stage0SentAt) {
    await trySendStage(db, env, row.id, programId, row.organizerId, row.organizer, 0, ctx, metrics, now, () => ({
      stage0SentAt: now,
      maxStageReached: Math.max(row.maxStageReached, 0),
    }));
    return;
  }

  if (!row.stage1SentAt && rules.shouldSendStage1(env, metrics)) {
    await trySendStage(db, env, row.id, programId, row.organizerId, row.organizer, 1, ctx, metrics, now, () => ({
      stage1SentAt: now,
      maxStageReached: Math.max(row.maxStageReached, 1),
    }));
    return;
  }

  if (!row.stage2SentAt && rules.shouldSendStage2(env, metrics)) {
    const followMs = env.CONVERSION_FOLLOWUP_DELAY_HOURS * 3600 * 1000;
    await trySendStage(db, env, row.id, programId, row.organizerId, row.organizer, 2, ctx, metrics, now, () => ({
      stage2SentAt: now,
      maxStageReached: Math.max(row.maxStageReached, 2),
      followUpDueAt: new Date(now.getTime() + followMs),
    }));
    return;
  }

  if (!row.stage3SentAt && rules.shouldSendStage3(env, metrics, stateSlice)) {
    const plain = buildPlainTextForStage(3, ctx);
    await ensureOwnerApprovalDraft({
      db,
      env,
      stage: 3,
      programId,
      organizerId: row.organizerId,
      organizer: row.organizer,
      programTitle: row.program.title,
      messageText: plain,
      metrics,
      now,
    });
    return;
  }

  if (!row.stage4SentAt && rules.shouldSendStage4(env, metrics, stateSlice, now)) {
    const plain = buildPlainTextForStage(4, ctx);
    await ensureOwnerApprovalDraft({
      db,
      env,
      stage: 4,
      programId,
      organizerId: row.organizerId,
      organizer: row.organizer,
      programTitle: row.program.title,
      messageText: plain,
      metrics,
      now,
    });
    return;
  }

  if (!row.stage5SentAt && rules.shouldSendStage5(env, metrics)) {
    const plain = buildPlainTextForStage(5, ctx);
    await ensureOwnerApprovalDraft({
      db,
      env,
      stage: 5,
      programId,
      organizerId: row.organizerId,
      organizer: row.organizer,
      programTitle: row.program.title,
      messageText: plain,
      metrics,
      now,
    });
  }
}
