import type { Env } from "@mywave/config";
import { randomUUID } from "node:crypto";
import { proxyFetch } from "../../lib/proxyFetch";

function buildMultipartBody(audio: Buffer, mime: string): { body: Buffer; contentType: string } {
  const boundary = `----mywave-${randomUUID()}`;
  const fileName = mime.includes("ogg") || mime.includes("oga") ? "a.ogg" : "a.mp3";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: ${mime || "application/ogg"}\r\n\r\n`,
    ),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Опционально: Whisper API. При ошибке или отсутствии ключа — null (pipeline не падает).
 */
export async function transcribeOggOrMp3(
  env: Env,
  _audio: Buffer,
  _mime: string,
): Promise<string | null> {
  const key = env.OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return null;
  }
  try {
    const { body, contentType } = buildMultipartBody(_audio, _mime);
    const r = await proxyFetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": contentType,
          "content-length": String(body.length),
        },
        body,
      },
      env.OPENAI_HTTP_PROXY,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { text?: string };
    return j.text?.trim() ?? null;
  } catch {
    return null;
  }
}
