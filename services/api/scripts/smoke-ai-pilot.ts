/**
 * Смоук Gate 2 P0: API должен быть запущен (pnpm --filter api dev).
 * Запуск: pnpm --filter api smoke:ai-pilot
 */
import "../src/env/loadProcessEnv";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const base = process.env.SMOKE_API_BASE ?? "http://127.0.0.1:3001";

function assertOk(status: number, expected: number, label: string, body: string) {
  if (status !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${status}, body=${body.slice(0, 500)}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "admin" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) throw new Error("No admin user in DB for smoke auth.");
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret?.trim()) throw new Error("Missing ADMIN_JWT_SECRET for smoke token.");
    const token = jwt.sign({ sub: admin.id, role: "admin" }, secret, { expiresIn: "15m" });
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const ownerPolicy = await fetch(`${base}/ai-pilot/owner-policy`, { headers });
    const ownerPolicyText = await ownerPolicy.text();
    assertOk(ownerPolicy.status, 200, "GET /ai-pilot/owner-policy", ownerPolicyText);
    const ownerPolicyJson = JSON.parse(ownerPolicyText) as { openaiConfigured?: boolean; AI_ENABLED?: boolean };
    console.log("OK GET /ai-pilot/owner-policy 200");

    const safety = await fetch(`${base}/ai-pilot/safety-check`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "Эта программа полностью безопасно и подходит всем." }),
    });
    const safetyText = await safety.text();
    assertOk(safety.status, 200, "POST /ai-pilot/safety-check", safetyText);
    const safetyJson = JSON.parse(safetyText) as { result?: { hasRiskyClaims?: boolean } };
    if (!safetyJson.result?.hasRiskyClaims) {
      throw new Error("POST /ai-pilot/safety-check: expected risky claims true");
    }
    console.log("OK POST /ai-pilot/safety-check 200 (risky claims detected)");

    const cardAuditor = await fetch(`${base}/ai-pilot/card-auditor`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        card: {
          title: "Тест-карточка",
          dates: ["2026-06-01"],
          location: "Казань",
          level: "beginner",
        },
      }),
    });
    const cardAuditorText = await cardAuditor.text();
    assertOk(cardAuditor.status, 200, "POST /ai-pilot/card-auditor", cardAuditorText);
    console.log("OK POST /ai-pilot/card-auditor 200");

    const normalize = await fetch(`${base}/ai-pilot/normalize`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: "Кэмп по вейксерфу в Краснодаре, 3 дня, ориентировочно 25000 рублей, уровень intermediate.",
        sourceUrl: "https://example.test/program",
        discipline: "Wakesurf",
        region: "Krasnodar",
      }),
    });
    const normalizeText = await normalize.text();
    assertOk(normalize.status, 200, "POST /ai-pilot/normalize", normalizeText);
    const normalizeJson = JSON.parse(normalizeText) as { meta?: { source?: string } };
    console.log(`OK POST /ai-pilot/normalize 200 (source=${normalizeJson.meta?.source ?? "unknown"})`);

    const founder = await fetch(`${base}/ai-pilot/founder-summary?period=weekly`, { headers });
    const founderText = await founder.text();
    assertOk(founder.status, 200, "GET /ai-pilot/founder-summary", founderText);
    const founderJson = JSON.parse(founderText) as { source?: string };
    console.log(`OK GET /ai-pilot/founder-summary 200 (source=${founderJson.source ?? "unknown"})`);

    const aiLogs = await prisma.auditLog.count({
      where: {
        entityType: "ai_pilot",
        changedField: {
          in: ["ai_normalize", "ai_card_auditor", "ai_safety_check", "ai_founder_summary", "ai_founder_summary_weekly"],
        },
      },
    });
    if (aiLogs <= 0) throw new Error("Expected ai_pilot audit logs after smoke.");
    console.log("OK audit log writes entityType=ai_pilot");

    const fallbackExpected = !ownerPolicyJson.openaiConfigured || !ownerPolicyJson.AI_ENABLED;
    if (fallbackExpected) {
      if (normalizeJson.meta?.source !== "fallback") {
        throw new Error("Expected normalize fallback without OPENAI/API enabled.");
      }
      if (founderJson.source !== "fallback") {
        throw new Error("Expected founder-summary fallback without OPENAI/API enabled.");
      }
      console.log("OK fallback mode without OPENAI/API enabled");
    } else {
      console.log("INFO OPENAI configured + AI enabled; fallback assertions skipped");
    }

    console.log("smoke-ai-pilot: all checks passed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
