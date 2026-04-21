import type { Env } from "@mywave/config";

function trimText(s: string | undefined | null): string {
  return (s ?? "").trim();
}

export type SendResult = { ok: boolean; reason?: string };

/** Resend HTTP API (ключ в EMAIL_PROVIDER_KEY). */
export async function sendNotificationEmail(env: Env, to: string, subject: string, html: string): Promise<SendResult> {
  const key = trimText(env.EMAIL_PROVIDER_KEY);
  if (!key) {
    return { ok: false, reason: "email_provider_missing" };
  }
  const from = trimText(env.NOTIFICATIONS_EMAIL_FROM) || "MyWave Travel <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [to.trim()], subject, html }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      return { ok: false, reason: t.slice(0, 500) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendNotificationTelegram(env: Env, chatId: string, text: string): Promise<SendResult> {
  const base = trimText(env.TELEGRAM_BOT_API_BASE_URL);
  if (!base || !trimText(chatId)) {
    return { ok: false, reason: "telegram_not_configured" };
  }
  const url = `${base.replace(/\/+$/, "")}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId.trim(), text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      return { ok: false, reason: t.slice(0, 500) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Заглушка доставки в MAX: реальный контракт подставляется через MAX_MESSENGER_* env.
 * Тело запроса — минимальный placeholder (`recipient_id` + `text`); при появлении официального API замените путь и JSON.
 */
export async function sendNotificationMax(env: Env, recipientId: string, text: string): Promise<SendResult> {
  const base = trimText(env.MAX_MESSENGER_API_BASE_URL);
  if (!base || !trimText(recipientId)) {
    return { ok: false, reason: "max_messenger_not_configured" };
  }
  const pathRaw = trimText(env.MAX_MESSENGER_SEND_PATH);
  const path = pathRaw ? (pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`) : "/send";
  const url = `${base.replace(/\/+$/, "")}${path}`;
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = trimText(env.MAX_MESSENGER_ACCESS_TOKEN);
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipient_id: recipientId.trim(),
        text,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      return { ok: false, reason: t.slice(0, 500) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
