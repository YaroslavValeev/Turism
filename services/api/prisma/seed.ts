/**
 * Seed: create one admin user for local/dev. User = admin/internal only.
 * Default: admin@mywave.local / admin123 (change in production)
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

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
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
