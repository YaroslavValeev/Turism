import type { Env } from "@mywave/config";
import { sendEmailIfConfigured, isSmtpConfigured } from "../subscriptions/mailer";

const EMAIL_IN_TEXT_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** Извлекает первый e-mail из строки контакта (часто в заявке только почта или «Имя email@…»). */
export function extractGuestEmail(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(EMAIL_IN_TEXT_RE);
  return m ? m[0].toLowerCase() : null;
}

function parseEmailAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  return new Set(
    raw
      .split(/[,;]/g)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function withReviewUtm(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", "transactional");
    u.searchParams.set("utm_campaign", "review_request");
    return u.toString();
  } catch {
    return url;
  }
}

export type ReviewInviteMailResult =
  | { ok: true }
  | { ok: false; reason: "no_smtp" | "staging_allowlist" | "send_failed" };

/**
 * Мягкое письмо с просьбой оставить отзыв (после модерации он может отображаться у организатора и в карточках программ).
 */
export async function sendReviewInvitationEmail(
  env: Env,
  params: {
    to: string;
    reviewUrl: string;
    programTitle: string;
    organizerName: string;
    isReminder: boolean;
  },
): Promise<ReviewInviteMailResult> {
  if (!isSmtpConfigured(env)) {
    return { ok: false, reason: "no_smtp" };
  }

  const allow = parseEmailAllowlist(env.EMAIL_STAGING_ALLOWLIST);
  const toLower = params.to.trim().toLowerCase();
  if (allow && !allow.has(toLower)) {
    return { ok: false, reason: "staging_allowlist" };
  }

  const link = withReviewUtm(params.reviewUrl);
  const prog = params.programTitle.trim() || "программе";
  const org = params.organizerName.trim() || "организатору";

  const subject = params.isReminder
    ? `Напоминание: отзыв о туре «${prog.length > 42 ? `${prog.slice(0, 40)}…` : prog}»`
    : `Как прошла поездка? Короткий отзыв поможет ${org}`;

  const intro = params.isReminder
    ? "Недавно мы присылали ссылку на короткий отзыв о вашем туре. Если будет минута — будем благодарны за пару строк: это помогает организатору и будущим участникам."
    : "Надеемся, поездка прошла хорошо. Если будет пара минут, расскажите, как всё прошло: отзыв проходит лёгкую модерацию и затем может отображаться в профиле организатора и в карточках следующих программ.";

  const text = [
    "Здравствуйте!",
    "",
    intro,
    "",
    `Программа: ${prog}`,
    `Организатор: ${org}`,
    "",
    `Оставить отзыв (1–5 и необязательный комментарий):`,
    link,
    "",
    "С уважением,",
    "Команда MyWaveTour",
    "",
    "Если вы не участвовали в этой поездке, просто проигнорируйте это письмо.",
  ].join("\n");

  const safeProg = escapeHtml(prog);
  const safeOrg = escapeHtml(org);
  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.55;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 12px;">Здравствуйте!</p>
  <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
  <p style="margin:0 0 6px;"><strong>Программа:</strong> ${safeProg}</p>
  <p style="margin:0 0 20px;"><strong>Организатор:</strong> ${safeOrg}</p>
  <p style="margin:0 0 12px;">
    <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Оставить отзыв</a>
  </p>
  <p style="margin:16px 0 0;font-size:14px;color:#5a5854;">Если кнопка не открывается, скопируйте ссылку: ${escapeHtml(link)}</p>
  <p style="margin:24px 0 0;font-size:14px;color:#8c8984;">С уважением,<br/>Команда MyWaveTour</p>
  <p style="margin:16px 0 0;font-size:13px;color:#8c8984;">Если вы не участвовали в этой поездке, проигнорируйте письмо.</p>
</body>
</html>`;

  const sent = await sendEmailIfConfigured(env, { to: params.to.trim(), subject, text, html });
  return sent ? { ok: true } : { ok: false, reason: "send_failed" };
}
