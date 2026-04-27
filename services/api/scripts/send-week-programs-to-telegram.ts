import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { buildTelegramProgramNotifyHtml, type ProgramNotifySource } from "../src/modules/subscriptions/programNotifyTemplates";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeMediaUrl(rawUrl: string | null | undefined, apiBase: string): string | null {
  const v = String(rawUrl ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return isPublicHttpUrl(v) ? v : null;
  if (v.startsWith("/")) {
    const full = `${apiBase}${v}`;
    return isPublicHttpUrl(full) ? full : null;
  }
  return null;
}

function toNotifySource(row: {
  id: string;
  title: string;
  discipline: string;
  region: string;
  startDate: Date;
  endDate: Date;
  audienceFit: string | null;
  inclusions: string | null;
  organizerName: string | null;
  levelRequired: string | null;
  formatType: string | null;
  cancellationRules: string | null;
  whatHappensAfterBooking: string | null;
  medicalLimitations: string | null;
  organizer: { displayName: string } | null;
}): ProgramNotifySource {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    region: row.region,
    startDate: row.startDate,
    endDate: row.endDate,
    audienceFit: row.audienceFit,
    inclusions: row.inclusions,
    organizerName: row.organizerName,
    organizerDisplayName: row.organizer?.displayName ?? null,
    levelRequired: row.levelRequired,
    formatType: row.formatType,
    cancellationRules: row.cancellationRules,
    whatHappensAfterBooking: row.whatHappensAfterBooking,
    medicalLimitations: row.medicalLimitations,
  };
}

function isLowQualityTitle(title: string): { bad: boolean; reasons: string[] } {
  const t = title.trim();
  const reasons: string[] = [];
  const maxLen = Number(process.env.TG_TITLE_MAX_LEN ?? "120");
  const maxUpperRatioPct = Number(process.env.TG_TITLE_MAX_UPPER_RATIO_PCT ?? "42");
  const allowPromoEmoji = process.env.TG_TITLE_ALLOW_PROMO_EMOJI === "1" || process.env.TG_TITLE_ALLOW_PROMO_EMOJI === "true";
  const allowClickbait = process.env.TG_TITLE_ALLOW_CLICKBAIT === "1" || process.env.TG_TITLE_ALLOW_CLICKBAIT === "true";
  const qualityEnabled = process.env.TG_TITLE_QUALITY_FILTER_ENABLED == null
    ? true
    : process.env.TG_TITLE_QUALITY_FILTER_ENABLED === "1" || process.env.TG_TITLE_QUALITY_FILTER_ENABLED === "true";
  if (!qualityEnabled) return { bad: false, reasons };

  if (!t) reasons.push("empty");
  if (t.length > maxLen) reasons.push("too_long");
  if (/[!?.]{3,}/.test(t)) reasons.push("excessive_punctuation");
  if (!allowPromoEmoji && /⚡|🔥|💪|🎉|🚀/.test(t)) reasons.push("promo_emoji");
  if (!allowClickbait && /привези|ставь на паузу|удиви всех|лучший|супер/i.test(t)) reasons.push("clickbait_phrase");

  const letters = Array.from(t).filter((ch) => /[A-Za-zА-Яа-яЁё]/.test(ch));
  const upper = letters.filter((ch) => /[A-ZА-ЯЁ]/.test(ch));
  if (letters.length >= 18 && upper.length / letters.length > maxUpperRatioPct / 100) reasons.push("too_much_uppercase");

  return { bad: reasons.length > 0, reasons };
}

async function sendPhoto(base: string, chatId: string, photoUrl: string): Promise<void> {
  await fetch(`${base}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      disable_notification: true,
    }),
  });
}

async function sendMessage(
  base: string,
  chatId: string,
  text: string,
  programUrl: string,
  webBase: string,
): Promise<void> {
  await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть карточку", url: programUrl }],
          [{ text: "Перейти на сайт", url: webBase }],
        ],
      },
    }),
  });
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = endOfWeekSunday(now);

  const baseRaw = process.env.TELEGRAM_BOT_API_BASE_URL?.trim();
  const chatId = process.env.TELEGRAM_UPDATES_CHANNEL_CHAT_ID?.trim();
  const webBase = process.env.PUBLIC_WEB_BASE_URL?.trim()?.replace(/\/+$/, "");
  const apiBase = process.env.PUBLIC_API_BASE_URL?.trim()?.replace(/\/+$/, "");

  if (!baseRaw || !chatId || !webBase || !apiBase) {
    throw new Error("Missing TELEGRAM_BOT_API_BASE_URL / TELEGRAM_UPDATES_CHANNEL_CHAT_ID / PUBLIC_WEB_BASE_URL / PUBLIC_API_BASE_URL");
  }
  const base = baseRaw.replace(/\/+$/, "");

  const programs = await prisma.program.findMany({
    where: {
      publishStatus: "published",
      startDate: { gte: weekStart, lte: weekEnd },
    },
    include: {
      organizer: { select: { displayName: true } },
      media: { where: { mediaType: "image" }, orderBy: { id: "asc" }, take: 1, select: { url: true } },
    },
    orderBy: { startDate: "asc" },
  });

  if (programs.length === 0) {
    console.log(JSON.stringify({ ok: true, message: "no_programs_this_week", weekStart, weekEnd }, null, 2));
    return;
  }

  const qualityFiltered = programs.filter((p) => !isLowQualityTitle(p.title).bad);
  const skipped = programs
    .filter((p) => isLowQualityTitle(p.title).bad)
    .map((p) => ({ id: p.id, title: p.title, reasons: isLowQualityTitle(p.title).reasons }));

  if (qualityFiltered.length === 0) {
    console.log(
      JSON.stringify(
        { ok: true, message: "no_quality_programs_this_week", weekStart, weekEnd, totalFound: programs.length, skipped },
        null,
        2,
      ),
    );
    return;
  }

  const sent: Array<{ id: string; title: string }> = [];
  for (const row of qualityFiltered) {
    const programUrl = `${webBase}/program/${row.id}?utm_source=telegram_channel&utm_medium=manual&utm_campaign=week_starts`;
    const text = buildTelegramProgramNotifyHtml(toNotifySource(row), programUrl);
    const photoUrl = normalizeMediaUrl(row.media[0]?.url ?? null, apiBase);

    if (!dryRun) {
      if (photoUrl) await sendPhoto(base, chatId, photoUrl);
      await sendMessage(base, chatId, text, programUrl, webBase);
    }
    sent.push({ id: row.id, title: row.title });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        weekStart,
        weekEnd,
        totalFound: programs.length,
        skippedCount: skipped.length,
        skipped,
        sentCount: sent.length,
        sent,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
