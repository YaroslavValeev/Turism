import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callOpenAiJson } from "./openaiJson";
import { buildEmailForTemplate } from "../organizer-outreach/templates";
import { computeOutreachMetrics, pickTemplateType } from "../organizer-outreach/metrics";
import { computeReportingWindow, submitOutreachForReview } from "../organizer-outreach/service";

const SYSTEM = `Ты AI-редактор outreach-драфта для организатора MyWave.
Правила:
- Никакой отправки и никаких side effects.
- Используй только переданные факты и метрики, не выдумывай.
- Верни JSON: {"subject":"", "body":""}
- Не обещай guaranteed результат, безопасность, Verified-статус.
`;

export async function buildOutreachDraft(
  env: Env,
  input: { organizerId: string; tone?: string }
): Promise<{
  campaignId: string;
  status: string;
  subject: string;
  body: string;
  source: "llm" | "template";
  requiresOwnerApproval: true;
}> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: input.organizerId },
    select: { id: true, displayName: true },
  });
  if (!organizer) throw new Error("organizer_not_found");

  const { periodStart, periodEnd } = computeReportingWindow();
  const metrics = await computeOutreachMetrics(organizer.id, periodStart, periodEnd);
  const templateType = pickTemplateType(metrics);
  const fallback = buildEmailForTemplate(templateType, organizer.displayName, metrics);

  let subject = fallback.subject;
  let body = fallback.body;
  let source: "llm" | "template" = "template";
  const r = await callOpenAiJson(
    env,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          tone: input.tone ?? "дружелюбный, деловой",
          organizerName: organizer.displayName,
          metrics,
          templateType,
          fallback,
        }),
      },
    ],
    { timeoutMs: 45_000 }
  );
  if (r.ok && r.json && typeof r.json === "object") {
    const j = r.json as Record<string, unknown>;
    if (typeof j.subject === "string" && j.subject.trim()) subject = j.subject;
    if (typeof j.body === "string" && j.body.trim()) body = j.body;
    source = "llm";
  }

  const existing = await prisma.organizerOutreachCampaign.findFirst({
    where: {
      organizerId: organizer.id,
      periodStart: { equals: periodStart },
      periodEnd: { equals: periodEnd },
    },
    select: { id: true },
  });

  const row = existing
    ? await prisma.organizerOutreachCampaign.update({
        where: { id: existing.id },
        data: {
          templateType,
          viewsCount: metrics.viewsCount,
          clicksCount: metrics.clicksCount,
          leadsCount: metrics.leadsCount,
          dealsCount: metrics.dealsCount,
          dealAmountTotal: metrics.dealAmountTotal,
          emailSubject: subject,
          emailBody: body,
          status: "draft",
          errorMessage: null,
        },
      })
    : await prisma.organizerOutreachCampaign.create({
        data: {
          organizerId: organizer.id,
          periodStart,
          periodEnd,
          templateType,
          viewsCount: metrics.viewsCount,
          clicksCount: metrics.clicksCount,
          leadsCount: metrics.leadsCount,
          dealsCount: metrics.dealsCount,
          dealAmountTotal: metrics.dealAmountTotal,
          emailSubject: subject,
          emailBody: body,
          status: "draft",
        },
      });

  return {
    campaignId: row.id,
    status: row.status,
    subject: row.emailSubject,
    body: row.emailBody,
    source,
    requiresOwnerApproval: true,
  };
}

export async function submitOutreachDraftForOwnerApproval(
  id: string,
  actorId: string | null
): Promise<{ ok: true; status: "pending_owner_review" }> {
  const r = await submitOutreachForReview(id, actorId);
  if (!r.ok) {
    throw new Error(r.error ?? "submit_failed");
  }
  return { ok: true, status: "pending_owner_review" };
}
