import { loadEnv } from "@mywave/config";
import { prisma } from "../src/lib/prisma";
import { handleTelegramPlatformUpdate } from "../src/modules/telegram-platform/webhookHandler";

async function main() {
  const env = loadEnv();
  const realTelegramUserId = Number((env.TELEGRAM_PLATFORM_OPS_IDS ?? "").split(",")[0]);
  if (!Number.isFinite(realTelegramUserId) || realTelegramUserId <= 0) {
    throw new Error("missing_real_data: TELEGRAM_PLATFORM_OPS_IDS must contain a real Telegram user id");
  }

  const program = await prisma.program.findFirst({
    where: { publishStatus: "published" },
    orderBy: { updatedAt: "desc" },
    include: { organizer: { include: { contactChannels: { where: { channelType: "telegram" }, take: 1 } } } },
  });
  if (!program) {
    throw new Error("missing_real_data: no published program in DB; OPS must publish/verify a real program before e2e");
  }

  const before = await prisma.lead.count({ where: { programId: program.id, source: "telegram-platform" } });
  const result = await handleTelegramPlatformUpdate(env, {
    update_id: Date.now(),
    message: {
      message_id: Date.now(),
      chat: { id: realTelegramUserId },
      from: { id: realTelegramUserId, username: "MyW23", first_name: "Ярослав" },
      text: `/start lead_${program.id}`,
    },
  });

  if (!result.ok) throw new Error(result.error);

  const lead = await prisma.lead.findFirst({
    where: { programId: program.id, source: "telegram-platform" },
    orderBy: { createdAt: "desc" },
  });
  const after = await prisma.lead.count({ where: { programId: program.id, source: "telegram-platform" } });
  if (!lead || after <= before) throw new Error("lead_not_created");

  const notes = lead.notes ?? "";
  const organizerChatId = program.organizer.contactChannels[0]?.telegramChatId?.trim();
  if (!organizerChatId && !notes.includes("organizer_telegram_channel_missing")) {
    throw new Error("expected organizer_telegram_channel_missing for missing_real_data contact route");
  }

  console.log(JSON.stringify({
    ok: true,
    programId: program.id,
    leadId: lead.id,
    route: organizerChatId ? "organizer" : "OPS",
    status: organizerChatId ? "sent_to_organizer" : "organizer_telegram_channel_missing",
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(`[telegram-platform-real-e2e] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
