"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { postPublicSubscription } from "../lib/publicApi";

type Props = {
  discipline?: string;
  region?: string;
};

export function StartAlertsSignup({ discipline, region }: Props) {
  const telegramInviteFallback = process.env.NEXT_PUBLIC_TELEGRAM_UPDATES_INVITE_LINK ?? "";
  const [email, setEmail] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tgOptInUrl, setTgOptInUrl] = useState<string | null>(null);
  const [tgGroupInviteUrl, setTgGroupInviteUrl] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email.trim() && !telegramUsername.trim()) {
      setError("Укажите email или Telegram username.");
      return;
    }
    if (!consent) {
      setError("Подтвердите согласие на получение обновлений.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await postPublicSubscription({
        email: email.trim() || undefined,
        telegramUsername: telegramUsername.trim() || undefined,
        discipline: discipline?.trim() || undefined,
        region: region?.trim() || undefined,
        emailOptIn: Boolean(email.trim()),
        telegramOptIn: Boolean(telegramUsername.trim()),
        channelEmail: Boolean(email.trim()),
        channelTelegram: Boolean(telegramUsername.trim()),
        consent,
        source: "homepage",
      });
      setSuccess(
        result.created
          ? "Готово. Мы будем присылать новые выезды и обновления MyWaveTour."
          : "Подписка уже активна.",
      );
      setTgOptInUrl(result.tgOptInUrl ?? null);
      setTgGroupInviteUrl(result.tgGroupInviteUrl ?? null);
      if (result.created) {
        setEmail("");
        setTelegramUsername("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось оформить подписку.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mw-card mw-alerts-signup">
      <p className="mw-alerts-signup__title">Не пропускай новые выезды</p>
      <p className="mw-alerts-signup__lead">
        Подпишись на обновления MyWaveTour в email или Telegram.
      </p>
      {(tgGroupInviteUrl ?? telegramInviteFallback) && (
        <a
          className="mw-alerts-signup__tg-link"
          href={tgGroupInviteUrl ?? telegramInviteFallback}
          target="_blank"
          rel="noreferrer"
        >
          Подписаться в Telegram
        </a>
      )}
      <form onSubmit={onSubmit} className="mw-alerts-signup__form">
        <div className="mw-alerts-signup__grid">
          <div className="mw-field">
            <label htmlFor="sub-email">Email</label>
            <input
              id="sub-email"
              type="email"
              className="mw-input"
              placeholder="you@email.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={submitting}
              aria-describedby={error ? "alerts-signup-feedback" : undefined}
              aria-invalid={Boolean(error && !email.trim() && !telegramUsername.trim())}
            />
          </div>
          <div className="mw-field">
            <label htmlFor="sub-tg">Telegram username</label>
            <input
              id="sub-tg"
              className="mw-input"
              placeholder="@username"
              value={telegramUsername}
              onChange={(ev) => setTelegramUsername(ev.target.value)}
              disabled={submitting}
              aria-describedby={error ? "alerts-signup-feedback" : undefined}
              aria-invalid={Boolean(error && !email.trim() && !telegramUsername.trim())}
            />
          </div>
          <button type="submit" className="mw-btn mw-btn--primary mw-alerts-signup__submit" disabled={submitting}>
            {submitting ? "Сохраняем..." : "Подписаться"}
          </button>
        </div>
        <div className="mw-alerts-signup__consent">
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(ev) => setConsent(ev.target.checked)}
              disabled={submitting}
              aria-describedby={error ? "alerts-signup-feedback" : undefined}
              aria-invalid={Boolean(error && !consent)}
            />
            <span>Согласен получать обновления MyWaveTour выбранным способом.</span>
          </label>
          <Link href="/privacy-and-consent" prefetch={false}>Политика и согласие</Link>
        </div>
      </form>
      {error && <p id="alerts-signup-feedback" className="mw-alerts-signup__error" role="alert">{error}</p>}
      {success && <p id="alerts-signup-feedback" className="mw-alerts-signup__success" role="status" aria-live="polite">{success}</p>}
      {(tgOptInUrl || tgGroupInviteUrl) && (
        <p className="mw-alerts-signup__hint">
          Telegram подключается через opt-in:{" "}
          {tgOptInUrl && (
            <>
              <a href={tgOptInUrl} target="_blank" rel="noreferrer">
                открыть бота
              </a>
              {tgGroupInviteUrl ? " · " : ""}
            </>
          )}
          {tgGroupInviteUrl && (
            <a href={tgGroupInviteUrl} target="_blank" rel="noreferrer">
              вступить в группу обновлений
            </a>
          )}
          .
        </p>
      )}
    </div>
  );
}
