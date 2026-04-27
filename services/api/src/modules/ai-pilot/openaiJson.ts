import type { Env } from "@mywave/config";

export type OpenAiJsonResult =
  | { ok: true; json: unknown; model: string }
  | { ok: false; reason: "no_key" | "ai_disabled" | "http_error" | "parse_error" | "timeout"; detail?: string };

/**
 * Вызов Chat Completions с response_format json. Без ключа или при AI_ENABLED=false — не ходит наружу.
 */
export async function callOpenAiJson(
  env: Env,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { timeoutMs?: number; model?: string }
): Promise<OpenAiJsonResult> {
  if (!env.OPENAI_API_KEY?.trim() || !env.AI_ENABLED) {
    if (!env.AI_ENABLED) return { ok: false, reason: "ai_disabled" };
    return { ok: false, reason: "no_key" };
  }
  const model = options?.model ?? "gpt-4o-mini";
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, reason: "http_error", detail: text.slice(0, 500) };
    }
    const body = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, reason: "parse_error", detail: "empty content" };
    }
    const json = JSON.parse(raw) as unknown;
    return { ok: true, json, model };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("Aborted")) {
      return { ok: false, reason: "timeout", detail: msg };
    }
    return { ok: false, reason: "parse_error", detail: msg };
  } finally {
    clearTimeout(t);
  }
}
