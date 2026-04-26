import type { Env } from "@mywave/config";

/**
 * Опционально: Whisper API. При ошибке или отсутствии ключа — null (pipeline не падает).
 */
export async function transcribeOggOrMp3(
  _env: Env,
  _audio: Buffer,
  _mime: string,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return null;
  }
  try {
    const form = new FormData();
    form.append("model", "whisper-1");
    const fileName = _mime.includes("ogg") || _mime.includes("oga") ? "a.ogg" : "a.mp3";
    form.append("file", new File([new Uint8Array(_audio.buffer, _audio.byteOffset, _audio.byteLength)], fileName, { type: _mime || "application/ogg" }));
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { text?: string };
    return j.text?.trim() ?? null;
  } catch {
    return null;
  }
}
