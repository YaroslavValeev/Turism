import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { INGESTION_MEDIA_DIR, INGESTION_MEDIA_PREFIX } from "../ingestion/mediaCache";

/** Совпадает с client_max_body_size для этого пути в infra/nginx/mywave.conf. */
export const MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export type DetectedUpload = { extension: "jpg" | "png" | "webp" | "mp4" | "webm"; mediaType: "image" | "video" };

/** Тип по сигнатуре файла: заголовку Content-Type из браузера не доверяем (SVG/HTML под видом картинки). */
export function detectUploadedMedia(buf: Buffer): DetectedUpload | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { extension: "jpg", mediaType: "image" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", mediaType: "image" };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { extension: "webp", mediaType: "image" };
  }
  if (buf.toString("ascii", 4, 8) === "ftyp") return { extension: "mp4", mediaType: "video" };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { extension: "webm", mediaType: "video" };
  return null;
}

/** Имя по хэшу содержимого: повторная загрузка того же файла не плодит копии. */
export async function saveUploadedMedia(buf: Buffer, detected: DetectedUpload): Promise<string> {
  const digest = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24);
  const filename = `upload-${digest}.${detected.extension}`;
  await fs.mkdir(INGESTION_MEDIA_DIR, { recursive: true });
  const target = path.join(INGESTION_MEDIA_DIR, filename);
  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, buf);
  }
  return `${INGESTION_MEDIA_PREFIX}/${filename}`;
}
