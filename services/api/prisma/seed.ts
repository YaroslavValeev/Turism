/**
 * Seed: create one admin user for local/dev. User = admin/internal only.
 * Default: admin@mywave.local / admin123 (change in production)
 * + один conversion draft awaiting_owner для E2E / ручной проверки (идемпотентно).
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { CONVERSION_DRAFT_STATUS, draftDedupeKey } from "../src/modules/conversion-funnel/drafts/constants";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const prisma = new PrismaClient();

async function main() {
  const email = "admin@mywave.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        role: "admin",
        passwordHash: hashPassword("admin123"),
      },
    });
    console.log("Admin user created: admin@mywave.local / admin123");
  } else {
    console.log("Admin user already exists");
  }

  const backfill = await prisma.program.updateMany({
    where: { intakeSource: null },
    data: { intakeSource: "admin_manual" },
  });
  if (backfill.count > 0) {
    console.log(`Backfill program.intakeSource=admin_manual for ${backfill.count} row(s)`);
  }

  const fixtureTitle = "[seed] E2E conversion draft fixture";
  const fixtureEmail = "conversion_fixture@mywave.local";
  const fixtureStage = 3;

  let organizer = await prisma.organizer.findFirst({ where: { contactEmail: fixtureEmail } });
  if (!organizer) {
    organizer = await prisma.organizer.create({
      data: {
        displayName: "Conversion fixture org",
        contactEmail: fixtureEmail,
        verificationStatus: "verified",
        onboardingStatus: "active",
      },
    });
    console.log("Conversion fixture organizer created:", fixtureEmail);
  }

  let program = await prisma.program.findFirst({
    where: { organizerId: organizer.id, title: fixtureTitle },
  });
  const now = new Date();
  if (!program) {
    program = await prisma.program.create({
      data: {
        organizerId: organizer.id,
        title: fixtureTitle,
        discipline: "tour",
        region: "RU",
        startDate: now,
        endDate: new Date(now.getTime() + 86400000),
        durationDays: 1,
        /** Не `published` — иначе карточка попадёт в публичный каталог (см. GET /programs). */
        publishStatus: "draft",
        intakeSource: "seed",
      },
    });
    console.log("Conversion fixture program created:", program.id);
  }

  const dedupe = draftDedupeKey(program.id, fixtureStage);
  const existingDraft = await prisma.conversionMessageDraft.findUnique({ where: { dedupeKey: dedupe } });
  if (!existingDraft) {
    await prisma.conversionMessageDraft.create({
      data: {
        organizerId: organizer.id,
        programId: program.id,
        stage: fixtureStage,
        channel: "telegram",
        messageText:
          "[seed] Текст черновика для owner approval. Можно менять в админке; E2E дописывает метку в конец.",
        status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
        dedupeKey: dedupe,
        metricsSnapshotJson: { seeded: true, purpose: "e2e_and_manual_smoke" },
      },
    });
    console.log("Conversion fixture draft created (awaiting_owner):", dedupe);
  } else {
    console.log("Conversion fixture draft already exists:", dedupe);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
