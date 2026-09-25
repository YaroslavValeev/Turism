import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { buildTelegramBotApiUrl, type Env } from "@mywave/config";
import { proxyAwareFetch } from "../../lib/proxyFetch";
import { INGESTION_MEDIA_DIR, INGESTION_MEDIA_PREFIX } from "../ingestion/mediaCache";

/** Лимит подписи к фото в Telegram (видимые символы, без HTML-тегов). */
export const TELEGRAM_CAPTION_LIMIT = 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export type TelegramPhotoRequest = {
  chatId: string | number;
  /** `/ingestion-media/<файл>` (загружаем файл) или публичный http(s) URL. */
  photo: string;
  caption?: string;
  parseMode?: "HTML";
  replyMarkup?: Record<string, unknown>;
  disableNotification?: boolean;
};

export type TelegramPhotoResult = { ok: boolean; description?: string };

export function visibleCaptionLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|amp|quot|#39);/g, "_").length;
}

/**
 * Локальные файлы витрины Telegram скачать не может (их отдаёт сайт, а не API),
 * поэтому такие фото загружаются в запросе как файл.
 */
export function resolveLocalIngestionMedia(photo: string): { filePath: string; contentType: string } | null {
  const prefix = `${INGESTION_MEDIA_PREFIX}/`;
  if (!photo.startsWith(prefix)) return null;
  const name = photo.slice(prefix.length);
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith(".")) return null;
  const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()];
  if (!contentType) return null;
  return { filePath: path.join(INGESTION_MEDIA_DIR, name), contentType };
}

function buildMultipart(
  fields: Record<string, string>,
  file: { field: string; filename: string; contentType: string; data: Buffer },
): { body: Buffer; contentType: string } {
  const boundary = `----mywave${crypto.randomBytes(12).toString("hex")}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "utf8"));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      "utf8",
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  );
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function readTelegramResult(response: Response): Promise<TelegramPhotoResult> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { ok?: boolean; description?: string };
    return { ok: Boolean(json.ok), description: json.description };
  } catch {
    return { ok: false, description: `HTTP ${response.status}` };
  }
}

export async function sendTelegramPhoto(env: Env, request: TelegramPhotoRequest): Promise<TelegramPhotoResult> {
  let sendPhotoUrl: string | undefined;
  try {
    sendPhotoUrl = buildTelegramBotApiUrl(env, "sendPhoto");
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
  if (!sendPhotoUrl) return { ok: false, description: "Telegram Bot API is not configured" };

  const fields: Record<string, string> = { chat_id: String(request.chatId) };
  if (request.caption) fields.caption = request.caption;
  if (request.parseMode) fields.parse_mode = request.parseMode;
  if (request.replyMarkup) fields.reply_markup = JSON.stringify(request.replyMarkup);
  if (request.disableNotification) fields.disable_notification = "true";

  try {
    const local = resolveLocalIngestionMedia(request.photo);
    if (local) {
      const data = await fs.readFile(local.filePath);
      const multipart = buildMultipart(fields, {
        field: "photo",
        filename: path.basename(local.filePath),
        contentType: local.contentType,
        data,
      });
      const response = await proxyAwareFetch(
        sendPhotoUrl,
        {
          method: "POST",
          headers: { "content-type": multipart.contentType, "content-length": String(multipart.body.length) },
          body: multipart.body,
        },
        env.TELEGRAM_BOT_HTTP_PROXY,
      );
      return readTelegramResult(response);
    }

    if (!/^https?:\/\//i.test(request.photo)) return { ok: false, description: "unsupported photo reference" };
    const response = await proxyAwareFetch(
      sendPhotoUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: request.chatId,
          photo: request.photo,
          ...(request.caption ? { caption: request.caption } : {}),
          ...(request.parseMode ? { parse_mode: request.parseMode } : {}),
          ...(request.replyMarkup ? { reply_markup: request.replyMarkup } : {}),
          ...(request.disableNotification ? { disable_notification: true } : {}),
        }),
      },
      env.TELEGRAM_BOT_HTTP_PROXY,
    );
    return readTelegramResult(response);
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
}
