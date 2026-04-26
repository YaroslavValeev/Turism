import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import type { Env } from "@mywave/config";
import { sendEmailIfConfigured } from "../subscriptions/mailer";
import { computeOutreachMetrics, hasOutreachActivity, pickTemplateType, type OutreachMetrics } from "./metrics.js";
import { buildEmailForTemplate } from "./templates.js";
import { notifyOutreachOwner } from "./notify.js";

function subDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

function defaultFreeDays(): number {
  const n = Number.parseInt(process.env.ORGANIZER_OUTREACH_MIN_FREE_DAYS ?? "60", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function defaultPeriodDays(): number {
  const n = Number.parseInt(process.env.ORGANIZER_OUTREACH_METRICS_DAYS ?? "30", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isOrganizerOutreachBlocked(o: {
  verificationStatus: string;
  privilegeStatus: string;
}): boolean {
  if (o.privilegeStatus === "suspended") return true;
  if (o.verificationStatus === "paused" || o.verificationStatus === "rejected") return true;
  return false;
}

export function computeReportingWindow(end: Date = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999)
  );
  const periodStart = subDays(periodEnd, defaultPeriodDays());
  periodStart.setUTCHours(0, 0, 0, 0);
  return { periodStart, periodEnd };
}

export type GenerateOutreachResult = {
  created: number;
  campaigns: { id: string; organizerId: string }[];
  errors: string[];
};

export async function generateOrganizerOutreachCampaigns(env: Env, actorId: string | null): Promise<GenerateOutreachResult> {
  const freeDays = defaultFreeDays();
  const minCreated = subDays(new Date(), freeDays);
  const { periodStart, periodEnd } = computeReportingWindow();
  const errors: string[] = [];
  const created: { id: string; organizerId: string }[] = [];

  const orgs = await prisma.organizer.findMany({
    where: {
      createdAt: { lte: minCreated },
    },
    select: {
      id: true,
      displayName: true,
      contactEmail: true,
      createdAt: true,
      verificationStatus: true,
      privilegeStatus: true,
    },
  });

  for (const o of orgs) {
    if (isOrganizerOutreachBlocked(o)) continue;
    if (!o.contactEmail || !isValidEmail(o.contactEmail)) continue;

    const existing = await prisma.organizerOutreachCampaign.findFirst({
      where: {
        organizerId: o.id,
        periodStart: { equals: periodStart },
        periodEnd: { equals: periodEnd },
      },
    });
    if (existing) continue;

    const m = await computeOutreachMetrics(o.id, periodStart, periodEnd);
    if (!hasOutreachActivity(m)) continue;

    const templateType = pickTemplateType(m);
    const { subject, body } = buildEmailForTemplate(templateType, o.displayName, m);

    const row = await prisma.organizerOutreachCampaign.create({
      data: {
        organizerId: o.id,
        periodStart,
        periodEnd,
        viewsCount: m.viewsCount,
        clicksCount: m.clicksCount,
        leadsCount: m.leadsCount,
        dealsCount: m.dealsCount,
        dealAmountTotal: m.dealAmountTotal,
        templateType,
        emailSubject: subject,
        emailBody: body,
        status: "pending_owner_review",
      },
    });

    await writeAuditLog({
      entityType: "organizer_outreach_campaign",
      entityId: row.id,
      changedField: "created",
      oldValue: null,
      newValue: row.id,
      changedBy: actorId,
      reason: "generate_organizer_outreach",
    });

    const tgr = await notifyOutreachOwner(env, {
      id: row.id,
      displayName: o.displayName,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      m,
      templateType,
    });
    if (tgr.error) {
      errors.push(`telegram ${o.id}: ${tgr.error}`);
    }

    created.push({ id: row.id, organizerId: o.id });
  }

  return { created: created.length, campaigns: created, errors };
}

export async function sendOutreachEmailForCampaign(
  env: Env,
  campaignId: string,
  actorId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.organizerOutreachCampaign.findUnique({
    where: { id: campaignId },
    include: { organizer: { select: { contactEmail: true, displayName: true } } },
  });
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "approved") {
    return { ok: false, error: `status ${row.status}: только approved` };
  }

  const to = row.organizer.contactEmail.trim();
  if (!isValidEmail(to)) {
    await prisma.organizerOutreachCampaign.update({
      where: { id: campaignId },
      data: { status: "failed", errorMessage: "invalid_organizer_email" },
    });
    return { ok: false, error: "invalid email" };
  }

  const ok = await sendEmailIfConfigured(env, {
    to,
    subject: row.emailSubject,
    text: row.emailBody,
  });
  if (!ok) {
    await prisma.organizerOutreachCampaign.update({
      where: { id: campaignId },
      data: {
        status: "failed",
        errorMessage: "smtp_not_configured_or_send_error",
        updatedAt: new Date(),
      },
    });
    return { ok: false, error: "email send failed" };
  }

  await prisma.organizerOutreachCampaign.update({
    where: { id: campaignId },
    data: { status: "sent", sentAt: new Date(), errorMessage: null },
  });
  await writeAuditLog({
    entityType: "organizer_outreach_campaign",
    entityId: row.id,
    changedField: "sent",
    oldValue: "approved",
    newValue: "sent",
    changedBy: actorId,
    reason: "organizer_outreach_send",
  });
  return { ok: true };
}

export async function approveOutreachCampaign(
  id: string,
  actorId: string | null
): Promise<void> {
  await prisma.organizerOutreachCampaign.update({
    where: { id },
    data: { status: "approved", ownerApprovedAt: new Date() },
  });
  await writeAuditLog({
    entityType: "organizer_outreach_campaign",
    entityId: id,
    changedField: "status",
    oldValue: "pending_owner_review",
    newValue: "approved",
    changedBy: actorId,
    reason: "organizer_outreach_approve",
  });
}

export async function skipOutreachCampaign(id: string, actorId: string | null): Promise<void> {
  const prev = await prisma.organizerOutreachCampaign.findUnique({ where: { id }, select: { status: true } });
  await prisma.organizerOutreachCampaign.update({
    where: { id },
    data: { status: "skipped" },
  });
  await writeAuditLog({
    entityType: "organizer_outreach_campaign",
    entityId: id,
    changedField: "status",
    oldValue: prev?.status ?? null,
    newValue: "skipped",
    changedBy: actorId,
    reason: "organizer_outreach_skip",
  });
}

export async function declineOutreachCampaign(id: string, actorId: string | null): Promise<void> {
  const prev = await prisma.organizerOutreachCampaign.findUnique({ where: { id }, select: { status: true } });
  await prisma.organizerOutreachCampaign.update({
    where: { id },
    data: { status: "failed", errorMessage: "owner_declined" },
  });
  await writeAuditLog({
    entityType: "organizer_outreach_campaign",
    entityId: id,
    changedField: "status",
    oldValue: prev?.status ?? null,
    newValue: "failed",
    changedBy: actorId,
    reason: "organizer_outreach_decline",
  });
}

export async function rewriteOutreachToDraft(
  id: string,
  body: { emailSubject: string; emailBody: string },
  actorId: string | null
): Promise<void> {
  const prev = await prisma.organizerOutreachCampaign.findUnique({ where: { id }, select: { status: true } });
  await prisma.organizerOutreachCampaign.update({
    where: { id },
    data: { emailSubject: body.emailSubject, emailBody: body.emailBody, status: "draft" },
  });
  await writeAuditLog({
    entityType: "organizer_outreach_campaign",
    entityId: id,
    changedField: "rewrite",
    oldValue: prev?.status ?? null,
    newValue: "draft",
    changedBy: actorId,
    reason: "organizer_outreach_rewrite",
  });
}

/** После правки в админке — вернуть в очередь owner (MVP, без auto-send). */
export async function submitOutreachForReview(
  id: string,
  actorId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.organizerOutreachCampaign.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "draft") {
    return { ok: false, error: `только status=draft, сейчас ${row.status}` };
  }
  await prisma.organizerOutreachCampaign.update({
    where: { id },
    data: { status: "pending_owner_review", errorMessage: null },
  });
  await writeAuditLog({
    entityType: "organizer_outreach_campaign",
    entityId: id,
    changedField: "status",
    oldValue: "draft",
    newValue: "pending_owner_review",
    changedBy: actorId,
    reason: "organizer_outreach_submit_for_review",
  });
  return { ok: true };
}

export async function approveAndSendOutreachCampaign(
  env: Env,
  campaignId: string,
  actorId: string | null
): Promise<{ ok: boolean; error?: string }> {
  await approveOutreachCampaign(campaignId, actorId);
  await new Promise((r) => setTimeout(r, 300));
  return sendOutreachEmailForCampaign(env, campaignId, actorId);
}

export { type OutreachMetrics };
