/**
 * Медиа Telegram: ссылки cdn*.telesco.pe подписаны и со временем отдают 404,
 * поэтому для витрины файлы должны лежать в /ingestion-media (см. mediaCache.ts).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { proxyAwareFetch } from "../../lib/proxyFetch";
import { cacheExternalProgramMediaForWeb } from "./mediaCache";

export type TelegramMediaEntry = { url: string; mediaType: "image" | "video" };

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36";

export function extractTelegramMediaUrls(block: string): TelegramMediaEntry[] {
  const out: TelegramMediaEntry[] = [];
  const push = (raw: string | undefined, mediaType: "image" | "video") => {
    const value = raw?.trim();
    if (!value || /\/\/telegram\.org\/img\/emoji\//i.test(value)) return;
    const url = value.startsWith("//") ? `https:${value}` : value;
    if (out.some((item) => item.url === url)) return;
    out.push({ url, mediaType });
  };

  for (const match of block.matchAll(/tgme_widget_message_photo_wrap[\s\S]*?background-image:url\('([^']+)'\)/gi)) {
    push(match[1], "image");
  }
  for (const match of block.matchAll(/tgme_widget_message_photo link_preview_media" style="background-image:url\('([^']+)'\)/gi)) {
    push(match[1], "image");
  }
  // Полные видеофайлы из публичной ленты t.me/s
  for (const match of block.matchAll(/<video[^>]+(?:class="[^"]*tgme_widget_message_video[^"]*")[^>]+src="([^"]+)"/gi)) {
    push(match[1], "video");
  }
  for (const match of block.matchAll(/<video[^>]+src="([^"]+)"[^>]+(?:class="[^"]*tgme_widget_message_video[^"]*")/gi)) {
    push(match[1], "video");
  }
  for (const match of block.matchAll(/tgme_widget_message_video_player[\s\S]*?<video[^>]+src="([^"]+)"/gi)) {
    push(match[1], "video");
  }
  for (const match of block.matchAll(/<source[^>]+src="([^"]+\.(?:mp4|webm)[^"]*)"/gi)) {
    push(match[1], "video");
  }
  // Превью видео — как фото обложки, если файла нет
  for (const match of block.matchAll(/tgme_widget_message_video_thumb[^>]*style="background-image:url\('([^']+)'\)/gi)) {
    push(match[1], "image");
  }
  for (const match of block.matchAll(/tgme_widget_message_roundvideo_thumb[^>]*style="background-image:url\('([^']+)'\)/gi)) {
    push(match[1], "image");
  }

  return out;
}

export function isTelegramCdnMediaUrl(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw.startsWith("//") ? `https:${raw}` : raw).hostname.toLowerCase();
    return (
      host.endsWith("telesco.pe") ||
      host.endsWith("cdn-telegram.org") ||
      (host.endsWith("telegram.org") && !host.startsWith("api."))
    );
  } catch {
    return false;
  }
}

export function parseTelegramPostRef(sourceUrl: string | null | undefined): { channel: string; postId: string } | null {
  const raw = String(sourceUrl ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host !== "t.me" && host !== "telegram.me" && host !== "www.t.me") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "s") segments.shift();
    const [channel, postId] = segments;
    if (!channel || !postId) return null;
    if (!/^[A-Za-z0-9_]{3,64}$/.test(channel) || !/^\d+$/.test(postId)) return null;
    return { channel, postId };
  } catch {
    return null;
  }
}

async function fetchTelegramPostMedia(ref: { channel: string; postId: string }): Promise<TelegramMediaEntry[]> {
  const proxy = process.env.TELEGRAM_BOT_HTTP_PROXY?.trim() || null;
  const response = await proxyAwareFetch(
    `https://t.me/${ref.channel}/${ref.postId}?embed=1&mode=tme`,
    { headers: { "user-agent": BROWSER_UA, accept: "text/html" } },
    proxy,
  );
  if (!response.ok) throw new Error(`t.me responded ${response.status}`);
  return extractTelegramMediaUrls(await response.text());
}

export type TelegramMediaRefreshResult = {
  programsChecked: number;
  programsUpdated: number;
  mediaCached: number;
  failures: Array<{ programId: string; reason: string }>;
};

/**
 * Перекачивает медиа программ, у которых в program_media остались ссылки Telegram CDN:
 * заново открывает исходный пост t.me через SOCKS и сохраняет файлы в /ingestion-media.
 */
export async function refreshTelegramProgramMedia(
  options: { limit?: number; programIds?: string[]; dryRun?: boolean } = {},
): Promise<TelegramMediaRefreshResult> {
  const staleRows = await prisma.programMedia.findMany({
    where: {
      OR: [{ url: { contains: "telesco.pe" } }, { url: { contains: "cdn-telegram.org" } }],
      ...(options.programIds?.length ? { programId: { in: options.programIds } } : {}),
    },
    select: { id: true, programId: true, url: true },
  });

  const staleByProgram = new Map<string, string[]>();
  for (const row of staleRows) {
    const ids = staleByProgram.get(row.programId) ?? [];
    ids.push(row.id);
    staleByProgram.set(row.programId, ids);
  }

  const result: TelegramMediaRefreshResult = { programsChecked: 0, programsUpdated: 0, mediaCached: 0, failures: [] };
  const programIds = [...staleByProgram.keys()].slice(0, options.limit ?? Number.POSITIVE_INFINITY);

  for (const programId of programIds) {
    result.programsChecked += 1;
    try {
      const program = await prisma.program.findUnique({
        where: { id: programId },
        select: { id: true, sourceUrl: true, media: { select: { url: true } } },
      });
      if (!program) throw new Error("program not found");

      const published = await prisma.publishedProgram.findUnique({
        where: { programId },
        select: { candidate: { select: { normalizedItem: { select: { rawItem: { select: { id: true, sourceUrl: true } } } } } } },
      });
      const rawItem = published?.candidate.normalizedItem.rawItem ?? null;

      const ref = parseTelegramPostRef(program.sourceUrl) ?? parseTelegramPostRef(rawItem?.sourceUrl);
      if (!ref) throw new Error(`no t.me post url (sourceUrl=${program.sourceUrl ?? "null"})`);

      const fresh = await fetchTelegramPostMedia(ref);
      if (!fresh.length) throw new Error(`no media in t.me/${ref.channel}/${ref.postId}`);

      const cached: TelegramMediaEntry[] = [];
      for (let index = 0; index < fresh.length; index += 1) {
        const entry = fresh[index]!;
        const local = await cacheExternalProgramMediaForWeb(
          entry.url,
          `tg-${ref.channel}-${ref.postId}-${index}-${entry.mediaType}`,
        );
        if (local?.startsWith("/ingestion-media/") && !cached.some((item) => item.url === local)) {
          cached.push({ url: local, mediaType: entry.mediaType });
        }
      }
      if (!cached.length) throw new Error("download via SOCKS failed for all media");
      result.mediaCached += cached.length;

      if (options.dryRun) continue;

      const existingUrls = new Set(program.media.map((item) => item.url));
      await prisma.$transaction([
        prisma.programMedia.deleteMany({ where: { id: { in: staleByProgram.get(programId)! } } }),
        prisma.programMedia.createMany({
          data: cached
            .filter((item) => !existingUrls.has(item.url))
            .map((item) => ({ programId, url: item.url, mediaType: item.mediaType })),
        }),
        ...(rawItem
          ? [
              prisma.rawItem.update({
                where: { id: rawItem.id },
                data: { rawMediaJson: fresh as unknown as Prisma.InputJsonValue },
              }),
            ]
          : []),
      ]);
      result.programsUpdated += 1;
    } catch (error) {
      result.failures.push({ programId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}
