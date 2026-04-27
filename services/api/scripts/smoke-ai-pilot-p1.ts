/**
 * Смоук Gate 2 P1: API должен быть запущен (pnpm --filter api dev).
 * Запуск: pnpm --filter api smoke:ai-pilot-p1
 */
import "../src/env/loadProcessEnv";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const base = process.env.SMOKE_API_BASE ?? "http://127.0.0.1:3001";

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "admin" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) throw new Error("No admin user in DB for smoke auth.");
    const organizer = await prisma.organizer.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!organizer) throw new Error("No organizer found for outreach draft smoke.");
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret?.trim()) throw new Error("Missing ADMIN_JWT_SECRET for smoke token.");
    const token = jwt.sign({ sub: admin.id, role: "admin" }, secret, { expiresIn: "15m" });
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const seo = await fetch(`${base}/ai-pilot/seo-assistant`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Вейксерф-кэмп в Краснодаре",
        discipline: "wakesurf",
        region: "krasnodar",
        summary: "Тренировочный лагерь с инструктором и проживанием.",
      }),
    });
    const seoBody = (await seo.json()) as { result?: { slug?: string } };
    if (seo.status !== 200 || !seoBody.result?.slug) {
      throw new Error(`seo-assistant failed: ${seo.status}`);
    }
    console.log("OK POST /ai-pilot/seo-assistant 200");

    const draft = await fetch(`${base}/ai-pilot/outreach-draft`, {
      method: "POST",
      headers,
      body: JSON.stringify({ organizerId: organizer.id, tone: "коротко и по делу" }),
    });
    const draftBody = (await draft.json()) as { campaignId?: string; status?: string; requiresOwnerApproval?: boolean };
    if (draft.status !== 200 || !draftBody.campaignId || draftBody.status !== "draft" || !draftBody.requiresOwnerApproval) {
      throw new Error(`outreach-draft failed: ${draft.status} ${JSON.stringify(draftBody).slice(0, 300)}`);
    }
    console.log("OK POST /ai-pilot/outreach-draft 200 (draft)");

    const approveStep = await fetch(`${base}/ai-pilot/outreach-draft/${draftBody.campaignId}/submit-owner-approval`, {
      method: "POST",
      headers,
    });
    const approveBody = (await approveStep.json()) as { status?: string; sendBlocked?: boolean };
    if (approveStep.status !== 200 || approveBody.status !== "pending_owner_review" || approveBody.sendBlocked !== true) {
      throw new Error(`submit-owner-approval failed: ${approveStep.status}`);
    }
    console.log("OK POST /ai-pilot/outreach-draft/:campaignId/submit-owner-approval 200");

    const weekly = await fetch(`${base}/ai-pilot/founder-summary/weekly`, { headers });
    const weeklyBody = (await weekly.json()) as { period?: string };
    if (weekly.status !== 200 || weeklyBody.period !== "weekly") {
      throw new Error(`founder-summary/weekly failed: ${weekly.status}`);
    }
    console.log("OK GET /ai-pilot/founder-summary/weekly 200");

    const aiLogs = await prisma.auditLog.count({
      where: {
        entityType: "ai_pilot",
        changedField: {
          in: [
            "ai_seo_assistant",
            "ai_outreach_draft",
            "ai_outreach_submit_owner_approval",
            "ai_founder_summary_weekly",
          ],
        },
      },
    });
    if (aiLogs < 4) throw new Error("Expected ai_pilot logs for P1 actions.");
    console.log("OK ai_pilot audit logs for P1 actions");

    console.log("smoke-ai-pilot-p1: all checks passed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
