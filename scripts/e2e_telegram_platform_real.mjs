#!/usr/bin/env node
/**
 * Real e2e (без синтетики): реальная published program из БД → webhook → lead submit → OPS routing.
 * Не выводит секреты и ПДн.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, "services/api/.env"), override: true });

const apiRequire = createRequire(resolve(root, "services/api/package.json"));
const { PrismaClient } = apiRequire("@prisma/client");

const API = (process.env.PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const WEBHOOK_SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const prisma = new PrismaClient();

const EXCLUDED_ORG_NAMES = ["E2E Pilot Org", "MTB School Demo", "Wake Camp Demo", "AllRide Demo", "Ski Tour Demo"];
const REQUIRED_REAL_E2E_ENV = [
  "DATABASE_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_ALERT_CHAT_ID",
  "TELEGRAM_PLATFORM_OPS_IDS",
  "TELEGRAM_E2E_REAL_CONFIRM",
  "TELEGRAM_E2E_REAL_USER_ID",
  "TELEGRAM_E2E_REAL_CHAT_ID",
  "TELEGRAM_E2E_REAL_FIRST_NAME",
  "TELEGRAM_E2E_REAL_GUEST_NAME",
  "TELEGRAM_E2E_REAL_PHONE",
];

function realEnv(name) {
  return (process.env[name] || "").trim();
}

function assertRealE2eEnv() {
  const missing = REQUIRED_REAL_E2E_ENV.filter((name) => !realEnv(name));
  if (realEnv("TELEGRAM_E2E_REAL_CONFIRM") && realEnv("TELEGRAM_E2E_REAL_CONFIRM") !== "1") {
    missing.push("TELEGRAM_E2E_REAL_CONFIRM=1");
  }
  if (missing.length > 0) {
    console.error(
      JSON.stringify(
        {
          status: "missing_env",
          reason: "real_e2e_requires_real_traveler_and_real_server_env",
          missing,
        },
        null,
        2
      )
    );
    process.exit(2);
  }
}

function parseRequiredIntegerEnv(name) {
  const raw = realEnv(name);
  if (!/^-?\d+$/.test(raw)) {
    console.error(`e2e_telegram_platform_real: missing_env — ${name} must be integer`);
    process.exit(2);
  }
  return Number(raw);
}

async function pickRealProgram() {
  const programs = await prisma.program.findMany({
    where: { publishStatus: "published", sourceUrl: { not: null } },
    select: {
      id: true,
      title: true,
      organizerId: true,
      discipline: true,
      region: true,
      organizer: { select: { displayName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  return (
    programs.find((p) => {
      const name = p.organizer.displayName;
      if (EXCLUDED_ORG_NAMES.includes(name)) return false;
      if (/demo/i.test(name)) return false;
      if (/e2e/i.test(name)) return false;
      return true;
    }) ?? null
  );
}

function webhookHeaders() {
  const h = { "content-type": "application/json" };
  if (WEBHOOK_SECRET) h["x-telegram-bot-api-secret-token"] = WEBHOOK_SECRET;
  return h;
}

async function postWebhook(update) {
  const r = await fetch(`${API}/public/telegram/webhook`, {
    method: "POST",
    headers: webhookHeaders(),
    body: JSON.stringify(update),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function main() {
  assertRealE2eEnv();

  const program = await pickRealProgram();
  if (!program) {
    console.error("e2e_telegram_platform_real: missing_real_data — нет published program с реальным организатором");
    process.exit(2);
  }

  const testChatId = parseRequiredIntegerEnv("TELEGRAM_E2E_REAL_CHAT_ID");
  const testUserId = parseRequiredIntegerEnv("TELEGRAM_E2E_REAL_USER_ID");
  const realFirstName = realEnv("TELEGRAM_E2E_REAL_FIRST_NAME");
  const realGuestName = realEnv("TELEGRAM_E2E_REAL_GUEST_NAME");
  const realPhone = realEnv("TELEGRAM_E2E_REAL_PHONE");
  const realUsername = realEnv("TELEGRAM_E2E_REAL_USERNAME") || undefined;
  const realComment = realEnv("TELEGRAM_E2E_REAL_COMMENT") || "real e2e leadgen check";
  const updateId = Date.now();

  console.log(
    JSON.stringify(
      {
        step: "picked_program",
        programId: program.id,
        programTitle: program.title,
        organizerId: program.organizerId,
        organizerName: program.organizer.displayName,
      },
      null,
      2
    )
  );

  // 1) /start with deep-link
  const start = await postWebhook({
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: testUserId, first_name: realFirstName, username: realUsername },
      chat: { id: testChatId, type: "private" },
      text: `/start program_${program.id}`,
    },
  });
  if (start.status !== 200) {
    console.error("webhook /start failed", start.status, start.body);
    process.exit(1);
  }

  // 2) Direct API lead flow (webhook FSM optional) — still real program, no synthetic organizer
  const startLead = await fetch(`${API}/public/telegram/platform/leads/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      telegramAccountId: testUserId,
      programId: program.id,
      deeplinkPayload: `program_${program.id}`,
    }),
  });
  const startBody = await startLead.json();
  if (!startLead.ok) {
    console.error("leads/start failed", startLead.status, startBody);
    process.exit(1);
  }

  const attemptId = startBody.attemptId;
  const tgInternalId = (
    await prisma.telegramUser.findUnique({ where: { telegramUserId: BigInt(testUserId) } })
  )?.id;
  if (!tgInternalId) {
    console.error("telegram user not created");
    process.exit(1);
  }

  const steps = [
    { step: "phone", patch: { guestName: realGuestName, phone: realPhone, telegramUsername: realUsername } },
    { step: "participants", patch: { participantsCount: 1 } },
    { step: "preview", patch: { comment: realComment } },
  ];
  for (const s of steps) {
    const r = await fetch(`${API}/public/telegram/platform/leads/${attemptId}/step`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ telegramUserId: tgInternalId, step: s.step, patch: s.patch }),
    });
    if (!r.ok) {
      console.error("lead step failed", s.step, await r.text());
      process.exit(1);
    }
  }

  const consentsRes = await fetch(`${API}/public/telegram/platform/leads/consents/${program.id}`);
  const consentsBody = await consentsRes.json();
  const submit = await fetch(`${API}/public/telegram/platform/leads/${attemptId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ telegramUserId: tgInternalId, consents: consentsBody.required }),
  });
  const submitBody = await submit.json();
  if (!submit.ok) {
    console.error("submit failed", submit.status, submitBody);
    process.exit(1);
  }

  const lead = await prisma.lead.findUnique({
    where: { leadToken: submitBody.leadToken },
    include: { reconciliationTasks: true },
  });
  const events = await prisma.telegramEventLog.findMany({
    where: { leadToken: submitBody.leadToken },
    orderBy: { createdAt: "asc" },
    select: { eventName: true },
  });

  const organizerChannel = await prisma.organizerContactChannel.findFirst({
    where: { organizerId: program.organizerId, channelType: "telegram", isPrimary: true },
  });

  console.log(
    JSON.stringify(
      {
        step: "result",
        leadToken: submitBody.leadToken,
        bookingId: submitBody.bookingId,
        leadStatus: lead?.leadStatus,
        sentToOrganizerAt: lead?.sentToOrganizerAt,
        organizerTelegramChatId: organizerChannel?.telegramChatId ?? null,
        routedToOpsExpected: !organizerChannel?.telegramChatId,
        reconciliation: lead?.reconciliationTasks?.map((t) => ({
          id: t.id,
          result: t.result,
          comment: t.comment,
        })),
        events: events.map((e) => e.eventName),
      },
      null,
      2
    )
  );

  const hasRoutedEvent = events.some((e) => e.eventName === "lead_routed_to_ops");
  const hasRecon = (lead?.reconciliationTasks?.length ?? 0) > 0;
  if (!hasRecon) {
    console.error("e2e failed: reconciliation task missing");
    process.exit(1);
  }
  if (!organizerChannel?.telegramChatId && !hasRoutedEvent) {
    console.error("e2e failed: expected lead_routed_to_ops when organizer telegram missing");
    process.exit(1);
  }

  console.log("e2e_telegram_platform_real: ok");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e.message || String(e));
  await prisma.$disconnect();
  process.exit(1);
});
