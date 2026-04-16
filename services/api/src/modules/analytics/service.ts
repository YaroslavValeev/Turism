import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { parseIngestionEvent, type ParsedIngestionEvent, type ValidationIssue } from "./validators";
import { getApiEnv } from "./runtimeEnv";

type IngestResult =
  | { status: "accepted"; id: string }
  | { status: "duplicate"; id: string }
  | { status: "skipped" }
  | { status: "rejected"; reason: ValidationIssue };

function fingerprintEvent(e: ParsedIngestionEvent): string {
  const canonical = {
    eventName: e.eventName,
    eventVersion: e.eventVersion,
    eventSource: e.eventSource,
    eventTime: e.eventTime.toISOString(),
    traceId: e.traceId ?? null,
    sessionId: e.sessionId ?? null,
    userIdHash: e.userIdHash ?? null,
    userRole: e.userRole ?? null,
    pageType: e.pageType ?? null,
    programId: e.programId ?? null,
    organizerId: e.organizerId ?? null,
    discipline: e.discipline ?? null,
    region: e.region ?? null,
    verifiedStatus: e.verifiedStatus ?? null,
    trafficSource: e.trafficSource ?? null,
    leadId: e.leadId ?? null,
    bookingId: e.bookingId ?? null,
    statementId: e.statementId ?? null,
    paymentId: e.paymentId ?? null,
    refundId: e.refundId ?? null,
    commissionId: e.commissionId ?? null,
    contractVersion: e.contractVersion ?? null,
    paymentStatus: e.paymentStatus ?? null,
    grossAmount: e.grossAmount ?? null,
    netAmount: e.netAmount ?? null,
    refundAmount: e.refundAmount ?? null,
    commissionRate: e.commissionRate ?? null,
    commissionAmount: e.commissionAmount ?? null,
    propertiesJson: e.propertiesJson ?? null,
  };
  return JSON.stringify(canonical);
}

async function recordError(input: {
  idempotencyKey?: string;
  eventName?: string;
  reason: ValidationIssue;
  rawPayload: unknown;
}) {
  await prisma.analyticsEventError.create({
    data: {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey ?? null,
      eventName: input.eventName ?? null,
      reasonCode: input.reason.code,
      message: input.reason.message,
      rawPayload: input.rawPayload as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function ingestSingleEvent(env: Env, raw: unknown): Promise<IngestResult> {
  if (!env.ANALYTICS_ENABLED) {
    return { status: "skipped" };
  }

  const parsed = parseIngestionEvent(raw);
  if (!parsed.ok) {
    const rawObj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const idempotencyKey = typeof rawObj?.idempotency_key === "string" ? rawObj.idempotency_key : undefined;
    const eventName = typeof rawObj?.event_name === "string" ? rawObj.event_name : undefined;
    await recordError({ idempotencyKey, eventName, reason: parsed.issue, rawPayload: raw });
    return { status: "rejected", reason: parsed.issue };
  }

  const e = parsed.value;
  const fp = fingerprintEvent(e);

  const same = await prisma.analyticsEvent.findUnique({
    where: { idempotencyKey: e.idempotencyKey },
  });
  if (same) {
    const existingFp = fingerprintEvent({
      eventName: same.eventName,
      eventVersion: same.eventVersion,
      eventSource: same.eventSource,
      eventTime: same.eventTime,
      idempotencyKey: same.idempotencyKey,
      traceId: same.traceId ?? undefined,
      sessionId: same.sessionId ?? undefined,
      userIdHash: same.userIdHash ?? undefined,
      userRole: same.userRole ?? undefined,
      pageType: same.pageType ?? undefined,
      programId: same.programId ?? undefined,
      organizerId: same.organizerId ?? undefined,
      discipline: same.discipline ?? undefined,
      region: same.region ?? undefined,
      verifiedStatus: same.verifiedStatus ?? undefined,
      trafficSource: same.trafficSource ?? undefined,
      leadId: same.leadId ?? undefined,
      bookingId: same.bookingId ?? undefined,
      statementId: same.statementId ?? undefined,
      paymentId: same.paymentId ?? undefined,
      refundId: same.refundId ?? undefined,
      commissionId: same.commissionId ?? undefined,
      contractVersion: same.contractVersion ?? undefined,
      paymentStatus: same.paymentStatus ?? undefined,
      grossAmount: same.grossAmount ?? undefined,
      netAmount: same.netAmount ?? undefined,
      refundAmount: same.refundAmount ?? undefined,
      commissionRate: same.commissionRate ?? undefined,
      commissionAmount: same.commissionAmount ?? undefined,
      propertiesJson: (same.propertiesJson as Record<string, unknown> | null) ?? null,
    });
    if (existingFp === fp) {
      return { status: "duplicate", id: same.id };
    }
    await recordError({
      idempotencyKey: e.idempotencyKey,
      eventName: e.eventName,
      reason: { code: "INVALID_FIELD", message: "idempotency_key conflict: payload differs" },
      rawPayload: raw,
    });
    return { status: "rejected", reason: { code: "INVALID_FIELD", message: "idempotency_key conflict: payload differs" } };
  }

  const created = await prisma.analyticsEvent.create({
    data: {
      eventName: e.eventName,
      eventVersion: e.eventVersion,
      eventSource: e.eventSource,
      eventTime: e.eventTime,
      idempotencyKey: e.idempotencyKey,
      traceId: e.traceId ?? null,
      sessionId: e.sessionId ?? null,
      userIdHash: e.userIdHash ?? null,
      userRole: e.userRole ?? null,
      pageType: e.pageType ?? null,
      programId: e.programId ?? null,
      organizerId: e.organizerId ?? null,
      discipline: e.discipline ?? null,
      region: e.region ?? null,
      verifiedStatus: e.verifiedStatus ?? null,
      trafficSource: e.trafficSource ?? null,
      leadId: e.leadId ?? null,
      bookingId: e.bookingId ?? null,
      statementId: e.statementId ?? null,
      paymentId: e.paymentId ?? null,
      refundId: e.refundId ?? null,
      commissionId: e.commissionId ?? null,
      contractVersion: e.contractVersion ?? null,
      paymentStatus: e.paymentStatus ?? null,
      grossAmount: e.grossAmount ?? null,
      netAmount: e.netAmount ?? null,
      refundAmount: e.refundAmount ?? null,
      commissionRate: e.commissionRate ?? null,
      commissionAmount: e.commissionAmount ?? null,
      propertiesJson: (e.propertiesJson ?? undefined) as Prisma.InputJsonValue | undefined,
      schemaValid: true,
      piiFlag: false,
    },
    select: { id: true },
  });

  return { status: "accepted", id: created.id };
}

export async function ingestEventsBatch(env: Env, events: unknown[]) {
  const results: IngestResult[] = [];
  for (const raw of events) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await ingestSingleEvent(env, raw));
  }
  const accepted = results.filter((r) => r.status === "accepted").length;
  const duplicate = results.filter((r) => r.status === "duplicate").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  return { results, accepted, duplicate, skipped, rejected };
}

export function emitBackendAnalyticsEventBestEffort(raw: Record<string, unknown>) {
  const env = getApiEnv();
  if (!env.ANALYTICS_ENABLED) return;
  void ingestSingleEvent(env, raw).catch(() => {
    // never throw to business flows
  });
}
