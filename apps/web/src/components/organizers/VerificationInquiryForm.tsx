"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { postOrganizerIntake } from "../../lib/publicApi";
import { trackProductEvent } from "../../lib/analytics/client";

export function VerificationInquiryForm() {
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!consent) {
      setError("Нужно согласие на обработку запроса.");
      return;
    }
    if (!message.trim()) {
      setError("Кратко опишите запрос — чем помочь по верификации.");
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await postOrganizerIntake({
        intakeType: "verification_inquiry",
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        organization: organization.trim() || undefined,
        message: message.trim(),
      });
      void trackProductEvent("organizer_apply_submitted", {
        page_type: "organizers_verification",
        traffic_source: "verification_inquiry",
        intake_id: id,
      });
      setSuccessId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить запрос.");
    } finally {
      setSubmitting(false);
    }
  }

  if (successId) {
    return (
      <div className="mw-card mw-organizer-page__success">
        <p className="mw-badge mw-badge--pilot" style={{ marginBottom: 12 }}>
          Запрос отправлен
        </p>
        <h2 className="mw-h2" style={{ marginTop: 0 }}>
          Мы свяжемся с вами
        </h2>
        <p style={{ color: "var(--mw-muted)" }}>
          Номер обращения: <strong style={{ color: "var(--mw-text)" }}>{successId}</strong>. Оператор ответит на указанный email.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          <Link href="/organizers/program" className="mw-btn mw-btn--primary">
            Подать программу
          </Link>
          <Link href="/" className="mw-btn mw-btn--ghost">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="mw-organizer-form" onSubmit={onSubmit}>
      <h2 className="mw-h2" style={{ marginTop: 0 }}>
        Запрос консультации по верификации
      </h2>
      <p style={{ color: "var(--mw-muted)", maxWidth: "62ch" }}>
        Опишите ситуацию: уже подавали программу, нужен разбор статуса или первичный контакт по требованиям.
      </p>

      <div className="mw-field">
        <label htmlFor="vq-name">Имя *</label>
        <input
          id="vq-name"
          className="mw-input"
          required
          autoComplete="name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
      </div>
      <div className="mw-field">
        <label htmlFor="vq-email">Email *</label>
        <input
          id="vq-email"
          type="email"
          className="mw-input"
          required
          autoComplete="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>
      <div className="mw-field">
        <label htmlFor="vq-phone">Телефон</label>
        <input id="vq-phone" type="tel" className="mw-input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </div>
      <div className="mw-field">
        <label htmlFor="vq-org">Команда / бренд</label>
        <input id="vq-org" className="mw-input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
      </div>
      <div className="mw-field">
        <label htmlFor="vq-msg">Ваш вопрос *</label>
        <textarea
          id="vq-msg"
          className="mw-textarea"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <label className="mw-organizer-form__consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Соглашаюсь на обработку данных для ответа по запросу.</span>
      </label>

      {error && (
        <p role="alert" style={{ color: "#b91c1c", margin: "0 0 8px" }}>
          {error}
        </p>
      )}

      <button type="submit" className="mw-btn mw-btn--primary" disabled={submitting}>
        {submitting ? "Отправка…" : "Отправить запрос"}
      </button>
    </form>
  );
}
