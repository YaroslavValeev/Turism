/**
 * Seed: admin user + optional demo catalog (5 орг. × 3 прог. = 15 опубликованных программ).
 * Локально / staging: полный сид (admin + опционально демо).
 * Production (`APP_ENV=production`): только демо-каталог, если явно `SEED_DEMO_CATALOG=1` (витрина на пустой БД).
 * Default: admin@mywave.local / admin123
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

const prisma = new PrismaClient();

const DEMO_TITLES = [
  "Фрирайд-интенсив",
  "Кайт-стартовый кэмп",
  "MTB-эндуро уикенд",
  "Вейк-кэмп на воде",
  "Ски-тур вне трасс",
  "Йога и сап",
  "Детский лагерь актив",
  "Грэвел по реке",
  "Сноукайт-ознакомление",
  "Серф-интенсив",
  "Трейл-раннинг",
  "Параплан-знакомство",
  "Оупен-вотер плавание",
  "Кемп скалолазания",
  "Сап-марафон",
] as const;

/** Имена без «demo» / лат. seed — иначе публичный GET /programs отфильтрует карточки (isSyntheticPublicProgram). */
const DEMO_ORGS: { displayName: string; email: string; discipline: string; region: string }[] = [
  { displayName: "Kite Pro Калининград", email: "seed-org-1@mywave.local", discipline: "kitesurfing", region: "Калининградская" },
  { displayName: "MTB School Кавказ", email: "seed-org-2@mywave.local", discipline: "mtb", region: "Кавказ" },
  { displayName: "Wake Camp Подмосковье", email: "seed-org-3@mywave.local", discipline: "wakesurf", region: "Подмосковье" },
  { displayName: "Ski Tour Карелия", email: "seed-org-4@mywave.local", discipline: "skiing", region: "Карелия" },
  { displayName: "AllRide Алтай", email: "seed-org-5@mywave.local", discipline: "multisport", region: "Алтай" },
];

async function seedDemoCatalog() {
  let t = 0;
  for (const spec of DEMO_ORGS) {
    let org = await prisma.organizer.findFirst({ where: { contactEmail: spec.email } });
    if (!org) {
      org = await prisma.organizer.create({
        data: {
          displayName: spec.displayName,
          contactEmail: spec.email,
          contactPhone: "+7 900 000-00-00",
          verificationStatus: "verified",
          onboardingStatus: "active",
          privilegeStatus: "active",
        },
      });
    }
    for (let i = 0; i < 3; i += 1) {
      const title = DEMO_TITLES[(t + i) % DEMO_TITLES.length]!;
      const start = new Date();
      start.setDate(start.getDate() + 14 + t * 3 + i * 2);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const exists = await prisma.program.findFirst({
        where: { organizerId: org.id, title, publishStatus: "published" },
      });
      if (exists) continue;
      const duration = Math.max(1, Math.round((+end - +start) / 86400000));
      await prisma.program.create({
        data: {
          organizerId: org.id,
          title: `${title} ${org.id.slice(0, 4)}`,
          discipline: spec.discipline,
          region: spec.region,
          exactLocation: "Площадка уточняется при бронировании",
          startDate: start,
          endDate: end,
          durationDays: duration,
          publishStatus: "published",
          intakeSource: "admin_manual",
          levelRequired: "beginner",
          priceFromRub: 15_000 + t * 500,
          capacityTotal: 20,
          spotsAvailable: 12,
          isStarred: t === 0 && i === 0,
          cancellationRules: "Условия отмены согласовываются с организатором.",
        },
      });
    }
    t += 1;
  }
  console.log("Demo catalog: 5 orgs × up to 3 programs (skip duplicates by title+org+published).");
}

async function main() {
  if (process.env.APP_ENV === "production") {
    if (process.env.SEED_DEMO_CATALOG === "1") {
      try {
        await seedDemoCatalog();
      } catch (e) {
        console.error("SEED_DEMO_CATALOG failed", e);
        throw e;
      }
      console.log("Production: seeded demo catalog only (no admin seed).");
      return;
    }
    console.log("Skip dev seed in production environment (set SEED_DEMO_CATALOG=1 for demo catalog only).");
    return;
  }
  const email = "admin@mywave.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        role: "admin",
        passwordHash: await hashPassword("admin123"),
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

  if (process.env.SEED_DEMO_CATALOG === "1") {
    try {
      await seedDemoCatalog();
    } catch (e) {
      console.error("SEED_DEMO_CATALOG failed", e);
      throw e;
    }
  } else {
    console.log("SEED_DEMO_CATALOG not set to 1 — skip demo orgs/programs. Set SEED_DEMO_CATALOG=1 to seed 5 orgs and programs.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
