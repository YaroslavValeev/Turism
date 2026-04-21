import type { Env } from "@mywave/config";
import { appendEmailFooter } from "./subscriptionCreateService";
import { signNotificationFeedbackToken } from "./notificationFeedbackTokens";
import { notificationTokenSecret } from "./notificationTokens";

function siteBase(env: Env): string {
  return (env.NOTIFICATIONS_SITE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function apiBase(env: Env): string {
  return (env.NOTIFICATIONS_LINK_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Тело письма о программе: CTA на каталог, реакции (подписанные ссылки), отписка. */
export function buildProgramNotificationEmailHtml(
  env: Env,
  params: {
    innerHtml: string;
    subscriptionId: string;
    contactEmail: string;
    programId: string;
    jobId: string;
    eventType: string;
    dedupeKey: string;
  },
): string {
  const secret = notificationTokenSecret(env);
  const base = {
    j: params.jobId,
    s: params.subscriptionId,
    p: params.programId,
    e: params.eventType,
    d: params.dedupeKey,
  };
  const posTok = signNotificationFeedbackToken(secret, { ...base, f: "positive" });
  const negTok = signNotificationFeedbackToken(secret, { ...base, f: "negative" });
  const api = apiBase(env);
  const posUrl = `${api}/public/notification-feedback?token=${encodeURIComponent(posTok)}`;
  const negUrl = `${api}/public/notification-feedback?token=${encodeURIComponent(negTok)}`;
  const programUrl = `${siteBase(env)}/program/${encodeURIComponent(params.programId)}`;
  const block = `
<p><a href="${escapeHtml(programUrl)}">Перейти к программе в каталоге</a></p>
<p style="font-size:14px;color:#444">Оцените письмо:
<a href="${escapeHtml(posUrl)}">Это было полезно</a>
·
<a href="${escapeHtml(negUrl)}">Не интересно</a>
</p>`.trim();
  return appendEmailFooter(env, `${params.innerHtml}\n${block}`, params.subscriptionId, params.contactEmail);
}
