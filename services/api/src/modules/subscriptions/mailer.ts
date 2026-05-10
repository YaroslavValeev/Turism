import nodemailer from "nodemailer";
import type { Env } from "@mywave/config";

type MailPayload = {
  to: string;
  subject: string;
  text: string;
  /** multipart/alternative HTML (Sprint 4 mini-landing) */
  html?: string;
};

function buildTransport(env: Env) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  const host = env.SMTP_HOST.toLowerCase();
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    ...(host.includes("gmail.com")
      ? { tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true } }
      : {}),
  });
}

export function isSmtpConfigured(env: Env): boolean {
  return !!(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS && env.SMTP_FROM?.trim());
}

export async function sendEmailIfConfigured(env: Env, payload: MailPayload): Promise<boolean> {
  const transport = buildTransport(env);
  const from = env.SMTP_FROM?.trim();
  if (!transport || !from) return false;
  try {
    await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    });
    return true;
  } catch (error) {
    console.error("[subscriptions] email send failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}
