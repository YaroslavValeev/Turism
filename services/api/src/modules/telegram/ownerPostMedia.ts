/**
 * Фото из поста, присланного владельцем в рабочий бот: скачиваем через Bot API в /ingestion-media
 * и прикладываем к черновику. Альбом Telegram приходит отдельными сообщениями с общим media_group_id,
 * подпись (текст поста) — только у одного из них, поэтому фото без подписи ждут программу в реестре.
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { buildTelegramFileApiUrl, type Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { proxyAwareFetch } from "../../lib/proxyFetch";
import { callTelegramJson } from "./telegramApi";
import { INGESTION_MEDIA_DIR, INGESTION_MEDIA_PREFIX } from "../ingestion/mediaCache";
import { nextMediaPosition } from "../programs/mediaOrder";

export type TgPhotoSize = { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number };

/** Bot API отдаёт файлы до 20 МБ. */
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function pickLargestPhoto(photo: TgPhotoSize[] | undefined): TgPhotoSize | null {
  if (!photo?.length) return null;
  return photo.reduce((best, size) => (size.width * size.height > best.width * best.height ? size : best), photo[0]!);
}

export function photoExtensionFromFilePath(filePath: string): string | null {
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  if (!PHOTO_EXTENSIONS.has(ext)) return null;
  return ext === "jpeg" ? "jpg" : ext;
}

/** URL файла содержит токен бота — в логи и ошибки он не попадает. */
export async function saveTelegramPhotoToIngestionMedia(env: Env, photo: TgPhotoSize): Promise<string | null> {
  const file = await callTelegramJson<{ file_path?: string; file_size?: number }>(env, "getFile", { file_id: photo.file_id });
  const filePath = file.ok ? file.result?.file_path : undefined;
  if (!filePath) return null;
  const extension = photoExtensionFromFilePath(filePath);
  if (!extension || (file.result?.file_size ?? 0) > MAX_PHOTO_BYTES) return null;

  const filename = `tg-owner-${crypto.createHash("sha256").update(photo.file_unique_id).digest("hex").slice(0, 20)}.${extension}`;
  const targetPath = path.join(INGESTION_MEDIA_DIR, filename);
  const publicUrl = `${INGESTION_MEDIA_PREFIX}/${filename}`;
  try {
    await fs.access(targetPath);
    return publicUrl;
  } catch {
    // ещё не скачан
  }

  const url = buildTelegramFileApiUrl(env, filePath);
  if (!url) return null;
  try {
    const response = await proxyAwareFetch(url, { signal: AbortSignal.timeout(45000) }, env.TELEGRAM_BOT_HTTP_PROXY);
    if (!response.ok) {
      console.warn(`[owner-post-media] telegram file download failed status=${response.status}`);
      return null;
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > MAX_PHOTO_BYTES) return null;
    await fs.mkdir(INGESTION_MEDIA_DIR, { recursive: true });
    await fs.writeFile(targetPath, body);
    return publicUrl;
  } catch {
    console.warn("[owner-post-media] telegram file download failed");
    return null;
  }
}

export async function appendProgramImages(programId: string, urls: string[]): Promise<number> {
  if (!urls.length) return 0;
  const existing = await prisma.programMedia.findMany({ where: { programId }, select: { url: true, position: true } });
  const known = new Set(existing.map((item) => item.url));
  let position = nextMediaPosition(existing);
  let added = 0;
  for (const url of urls) {
    if (known.has(url)) continue;
    await prisma.programMedia.create({
      data: { programId, mediaType: "image", url, caption: "Фото из поста владельца", position },
    });
    known.add(url);
    position += 1;
    added += 1;
  }
  return added;
}

type AlbumEntry = { programId: string | null; pendingUrls: string[]; expiresAt: number };

const ALBUM_TTL_MS = 10 * 60 * 1000;

/** Память процесса достаточна: части альбома приходят в пределах секунд, API — один процесс. */
export class OwnerAlbumRegistry {
  private readonly entries = new Map<string, AlbumEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  private entry(groupId: string): AlbumEntry {
    const current = this.now();
    for (const [key, value] of this.entries) {
      if (value.expiresAt < current) this.entries.delete(key);
    }
    let entry = this.entries.get(groupId);
    if (!entry) {
      entry = { programId: null, pendingUrls: [], expiresAt: current + ALBUM_TTL_MS };
      this.entries.set(groupId, entry);
    }
    return entry;
  }

  /** Программа из подписанного сообщения альбома; возвращает фото, пришедшие раньше подписи. */
  bindProgram(groupId: string, programId: string): string[] {
    const entry = this.entry(groupId);
    entry.programId = programId;
    const pending = entry.pendingUrls;
    entry.pendingUrls = [];
    return pending;
  }

  /** Фото без подписи: programId, если программа уже известна, иначе фото ждёт bindProgram. */
  addPhoto(groupId: string, url: string): string | null {
    const entry = this.entry(groupId);
    if (entry.programId) return entry.programId;
    entry.pendingUrls.push(url);
    return null;
  }
}

export const ownerAlbumRegistry = new OwnerAlbumRegistry();
