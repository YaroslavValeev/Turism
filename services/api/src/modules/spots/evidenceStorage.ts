import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { detectUploadedMedia } from "../programs/mediaUpload";

/** Совпадает с client_max_body_size для этого пути в infra/nginx/mywave.conf. */
export const SPOT_EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;

/** Приватный каталог: не должен совпадать с публичным /ingestion-media (web отдаёт его без авторизации). */
export function spotEvidenceDir(): string {
  const fromEnv = (process.env.SPOT_EVIDENCE_DIR ?? "").trim();
  return fromEnv || path.resolve(__dirname, "../../../../../var/spot-evidence");
}

export type EvidenceKind = "photo" | "video" | "document";

export interface DetectedEvidence {
  extension: "jpg" | "png" | "webp" | "mp4" | "webm" | "pdf";
  mimeType: string;
  kind: EvidenceKind;
}

const MIME_BY_EXTENSION: Record<DetectedEvidence["extension"], string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

export function detectEvidence(buf: Buffer): DetectedEvidence | null {
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") {
    return { extension: "pdf", mimeType: MIME_BY_EXTENSION.pdf, kind: "document" };
  }
  const media = detectUploadedMedia(buf);
  if (!media) return null;
  return {
    extension: media.extension,
    mimeType: MIME_BY_EXTENSION[media.extension],
    kind: media.mediaType === "image" ? "photo" : "video",
  };
}

const STORAGE_KEY_RE = /^[a-f0-9]{64}\.(jpg|png|webp|mp4|webm|pdf)$/;

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_RE.test(key);
}

export function resolveEvidencePath(storageKey: string): string | null {
  if (!isValidStorageKey(storageKey)) return null;
  return path.join(spotEvidenceDir(), storageKey);
}

export interface StoredEvidence {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

/** Имя = sha256 содержимого: хэш одновременно ключ, контроль целостности и защита от дублей. */
export async function saveEvidenceFile(buf: Buffer, detected: DetectedEvidence): Promise<StoredEvidence> {
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const storageKey = `${sha256}.${detected.extension}`;
  const dir = spotEvidenceDir();
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, storageKey);
  try {
    await fs.access(target);
  } catch {
    await fs.writeFile(target, buf, { mode: 0o640 });
  }
  return { storageKey, sha256, sizeBytes: buf.length };
}

export async function readEvidenceFile(storageKey: string, expectedSha256: string): Promise<Buffer | null> {
  const file = resolveEvidencePath(storageKey);
  if (!file) return null;
  let buf: Buffer;
  try {
    buf = await fs.readFile(file);
  } catch {
    return null;
  }
  const actual = crypto.createHash("sha256").update(buf).digest("hex");
  if (actual !== expectedSha256) throw new Error(`spot evidence ${storageKey} failed integrity check`);
  return buf;
}
