"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { postOrganizerIntake } from "../../lib/publicApi";
import { trackProductEvent } from "../../lib/analytics/client";

const DISCIPLINES = [
  { value: "Wakesurf", label: "Wakesurf / вейксерф" },
  { value: "SUP", label: "SUP / сапбординг" },
  { value: "MTB", label: "MTB / маунтинбайк" },
  { value: "Ski", label: "Горные лыжи / ски-тур" },
  { value: "Snowboard", label: "Сноуборд" },
  { value: "other", label: "Другое (указать в описании)" },
];

const REGION_PRESETS = [
  { value: "Krasnodar", label: "Россия · Краснодарский край" },
  { value: "Sochi", label: "Россия · Сочи / Красная Поляна" },
  { value: "Karelia", label: "Россия · Карелия" },
  { value: "Altai", label: "Россия · Алтай" },
  { value: "Kamchatka", label: "Россия · Камчатка" },
  { value: "Moscow", label: "Россия · Подмосковье / Москва" },
] as const;

const REGION_CUSTOM = "custom" as const;

export function ProgramIntakeForm() {
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [programTitle, setProgramTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [regionChoice, setRegionChoice] = useState<string>("");
  const [regionCustom, setRegionCustom] = useState("");
  const [plannedDates, setPlannedDates] = useState("");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!consent) {
      setError("Нужно согласие на обработку заявки.");
      return;
    }
    const region =
      regionChoice === REGION_CUSTOM ? regionCustom.trim() : regionChoice;
    if (regionChoice === REGION_CUSTOM && !region) {
      setError("Укажите название локации или выберите направление из списка.");
      return;
    }
    if (region.length > 200) {
      setError("Название локации слишком длинное — до 200 символов.");
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await postOrganizerIntake({
        intakeType: "program_submission",
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        organization: organization.trim() || undefined,
        programTitle: programTitle.trim(),
        discipline,
        region,
        plannedDates: plannedDates.trim() || undefined,
        message: message.trim() || undefined,
        links: links.trim() || undefined,
      });
      void trackProductEvent("program_submitted", {
        page_type: "organizers_program",
        discipline,
        region,
        traffic_source: "organizer_intake",
        intake_id: id,
      });
      setSuccessId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  }

  if (successId) {
    return (
      <div className="mw-card mw-organizer-page__success">
        <p className="mw-badge mw-badge--pilot" style={{ marginBottom: 12 }}>
          Заявка принята
        </p>
        <h2 className="mw-h2" style={{ marginTop: 0 }}>
          Спасибо — мы получили вашу заявку
        </h2>
        <p style={{ color: "var(--mw-muted)", marginBottom: 16 }}>
          Номер заявки: <strong style={{ color: "var(--mw-text)" }}>{successId}</strong>. Сохраните его для переписки с оператором.
        </p>
        <p style={{ color: "var(--mw-muted)", marginBottom: 24 }}>
          Дальше оператор MyWaveTour свяжется с вами по указанному email, уточнит детали программы и подскажет шаги публикации
          и верификации.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link href="/organizers/verification" className="mw-btn mw-btn--primary">
            Узнать про верификацию
          </Link>
          <Link href="/#organizers" className="mw-btn mw-btn--ghost">
            К блоку для организаторов
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
      <p style={{ color: "var(--mw-muted)", maxWidth: "62ch", marginTop: 0 }}>
        Заполните форму — данные попадут команде MyWaveTour. Публикация в каталоге по России возможна после согласования карточки
        программы с оператором.
      </p>

      <fieldset className="mw-organizer-form__fieldset">
        <legend>Контакты</legend>
        <div className="mw-field">
          <label htmlFor="pi-name">Как к тебе обращаться *</label>
          <input
            id="pi-name"
            className="mw-input"
            required
            autoComplete="name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="mw-field">
          <label htmlFor="pi-email">Email *</label>
          <input
            id="pi-email"
            type="email"
            className="mw-input"
            required
            autoComplete="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <div className="mw-field">
          <label htmlFor="pi-phone">Телефон</label>
          <input
            id="pi-phone"
            type="tel"
            className="mw-input"
            autoComplete="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>
        <div className="mw-field">
          <label htmlFor="pi-org">Команда / бренд / юр. лицо</label>
          <input id="pi-org" className="mw-input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </div>
      </fieldset>

      <fieldset className="mw-organizer-form__fieldset">
        <legend>Программа</legend>
        <div className="mw-field">
          <label htmlFor="pi-title">Название программы / кэмпа *</label>
          <input id="pi-title" className="mw-input" required value={programTitle} onChange={(e) => setProgramTitle(e.target.value)} />
        </div>
        <div className="mw-organizer-form__row">
          <div className="mw-field">
            <label htmlFor="pi-discipline">Дисциплина *</label>
            <select id="pi-discipline" className="mw-select" required value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
              <option value="" disabled>Выберите дисциплину…</option>
              {DISCIPLINES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="pi-region">Регион / локация в России *</label>
            <select
              id="pi-region"
              className="mw-select"
              required
              value={regionChoice}
              onChange={(e) => setRegionChoice(e.target.value)}
            >
              <option value="" disabled>Выберите регион или локацию…</option>
              {REGION_PRESETS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value={REGION_CUSTOM}>Другая локация…</option>
            </select>
            {regionChoice === REGION_CUSTOM && (
              <div className="mw-field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label htmlFor="pi-region-custom">Название локации *</label>
                <input
                  id="pi-region-custom"
                  className="mw-input"
                  required
                  value={regionCustom}
                  onChange={(e) => setRegionCustom(e.target.value)}
                  placeholder="Например: Россия · Санкт-Петербург, Россия · Шерегеш"
                  maxLength={200}
                  autoComplete="off"
                />
                <p style={{ color: "var(--mw-muted)", fontSize: "0.9rem", margin: "8px 0 0", lineHeight: 1.45 }}>
                  Укажите регион и населённый пункт или курорт в РФ — так локация попадёт в заявку и в карточку программы.
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="mw-field">
          <label htmlFor="pi-dates">Планируемые даты или окна (сезон)</label>
          <input
            id="pi-dates"
            className="mw-input"
            placeholder="Например: май–июнь 2026, уикенды"
            value={plannedDates}
            onChange={(e) => setPlannedDates(e.target.value)}
          />
        </div>
        <div className="mw-field">
          <label htmlFor="pi-msg">Что важно для тебя в этом выезде</label>
          <textarea
            id="pi-msg"
            className="mw-textarea"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Кратко: для кого программа, длительность, базовые условия…"
          />
        </div>
        <div className="mw-field">
          <label htmlFor="pi-links">Ссылки (сайт, соцсети, видео)</label>
          <textarea id="pi-links" className="mw-textarea" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} />
        </div>
      </fieldset>

      <label className="mw-organizer-form__consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Соглашаюсь на обработку данных по заявке MyWaveTour и контакт оператора по указанному email / телефону.
        </span>
      </label>

      {error && (
        <p role="alert" style={{ color: "#b91c1c", margin: "0 0 8px" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <button type="submit" className="mw-btn mw-btn--primary" disabled={submitting}>
          {submitting ? "Отправка…" : "Отправить заявку"}
        </button>
        <Link href="/organizers/verification" className="mw-btn mw-btn--ghost">
          Сначала про верификацию
        </Link>
      </div>
    </form>
  );
}
