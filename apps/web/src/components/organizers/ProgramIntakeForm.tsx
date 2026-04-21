"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  fetchProgramPublishHints,
  postOrganizerIntake,
  type ProgramDraftV2,
  type ProgramIntakeMetaV2,
  type ProgramPublishHints,
  type SupplyTrack,
} from "../../lib/publicApi";
import { trackProductEvent } from "../../lib/analytics/client";

const DISCIPLINES = [
  { value: "Wakesurf", label: "Wakesurf / вейксерф" },
  { value: "SUP", label: "SUP / сапбординг" },
  { value: "MTB", label: "MTB / маунтинбайк" },
  { value: "other", label: "Другое (указать в описании)" },
];

const REGION_PRESETS = [
  { value: "Krasnodar", label: "Россия · Краснодар" },
  { value: "Dubai", label: "ОАЭ · Дубай" },
  { value: "Bodrum", label: "Турция · Бодрум" },
] as const;

const REGION_CUSTOM = "custom" as const;

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Начальный" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
  { value: "expert", label: "Экспертный" },
  { value: "all_levels", label: "Любой уровень" },
];

const RISK_OPTIONS = [
  { value: "low", label: "Низкий" },
  { value: "medium", label: "Средний" },
  { value: "high", label: "Высокий" },
  { value: "critical", label: "Критический" },
];

function emptyDraft(): ProgramDraftV2 {
  return {
    exactLocation: "",
    startDate: "",
    endDate: "",
    durationDays: 5,
    levelRequired: "intermediate",
    riskLevel: "medium",
    gearRequirements: "",
    medicalLimitations: "",
    cancellationRules: "",
    audienceFit: "",
    inclusions: "",
    exclusions: "",
    itineraryDayByDay: "",
    formatType: "",
    priceFromRub: null,
    currency: "RUB",
    organizerDisplayName: "",
    trustReason: "",
    reviewsSummary: "",
    whatHappensAfterBooking: "",
    cta: "",
  };
}

export function ProgramIntakeForm() {
  const [hints, setHints] = useState<ProgramPublishHints | null>(null);
  const [supplyTrack, setSupplyTrack] = useState<SupplyTrack>("standard");
  const [step, setStep] = useState(0);

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [organization, setOrganization] = useState("");

  const [programTitle, setProgramTitle] = useState("");
  const [discipline, setDiscipline] = useState("Wakesurf");
  const [regionChoice, setRegionChoice] = useState<string>("Krasnodar");
  const [regionCustom, setRegionCustom] = useState("");
  const [draft, setDraft] = useState<ProgramDraftV2>(() => emptyDraft());

  const [message, setMessage] = useState("");
  const [links, setLinks] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    void fetchProgramPublishHints().then(setHints);
  }, []);

  const regionValue = useMemo(() => {
    return regionChoice === REGION_CUSTOM ? regionCustom.trim() : regionChoice;
  }, [regionChoice, regionCustom]);

  const stepsMeta = useMemo(() => {
    const base = [
      { id: "track", title: "Тип подачи" },
      { id: "contacts", title: "Контакты" },
      { id: "core", title: "Программа и место" },
      { id: "dates", title: "Даты и длительность" },
      { id: "safety", title: "Уровень и безопасность" },
      { id: "content", title: "Содержание" },
    ];
    if (supplyTrack === "verified_style") {
      base.push({ id: "verified", title: "Слой verified / trusted" });
    }
    base.push({ id: "extra", title: "Ссылки и отправка" });
    return base;
  }, [supplyTrack]);

  const maxStep = stepsMeta.length - 1;

  useEffect(() => {
    setStep((s) => Math.min(s, maxStep));
  }, [maxStep]);

  function patchDraft<K extends keyof ProgramDraftV2>(key: K, value: ProgramDraftV2[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function validateCurrentStep(): string | null {
    const sid = stepsMeta[step]?.id;
    if (sid === "track") return null;
    if (sid === "contacts") {
      if (!contactName.trim()) return "Укажите имя и фамилию / контактное лицо.";
      if (!contactEmail.trim()) return "Укажите email.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) return "Проверьте формат email.";
      return null;
    }
    if (sid === "core") {
      if (!programTitle.trim()) return "Укажите название программы.";
      if (!regionValue || regionValue.length > 200) return "Укажите направление (до 200 символов).";
      if (regionChoice === REGION_CUSTOM && !regionCustom.trim()) return "Введите название локации.";
      if (!draft.exactLocation.trim()) return "Укажите точное место (город, база, акватория…).";
      return null;
    }
    if (sid === "dates") {
      if (!draft.startDate || !draft.endDate) return "Укажите даты начала и окончания.";
      if (new Date(draft.startDate) > new Date(draft.endDate)) return "Дата начала не может быть позже даты окончания.";
      if (!Number.isFinite(draft.durationDays) || draft.durationDays <= 0) return "Укажите длительность в днях (число > 0).";
      return null;
    }
    if (sid === "safety") {
      if (!draft.levelRequired) return "Выберите уровень подготовки.";
      if (!draft.riskLevel) return "Выберите оценку риска.";
      if (!draft.gearRequirements.trim()) return "Заполните блок про экипировку и требования.";
      if (draft.medicalLimitations.trim() === "") return "Заполните медицинские ограничения (можно «Нет»).";
      if (!draft.cancellationRules.trim()) return "Заполните условия отмены и участия.";
      return null;
    }
    if (sid === "content") {
      const has =
        draft.audienceFit.trim() !== "" || draft.inclusions.trim() !== "" || draft.itineraryDayByDay.trim() !== "";
      if (!has) return "Заполните хотя бы одно: для кого программа, что включено или план по дням.";
      if (supplyTrack === "verified_style") {
        if (!draft.audienceFit.trim()) return "Для verified-слоя нужен блок «для кого программа».";
        if (!draft.inclusions.trim()) return "Для verified-слоя нужен блок «что включено».";
        if (!draft.itineraryDayByDay.trim()) return "Для verified-слоя нужен план по дням.";
      }
      return null;
    }
    if (sid === "verified") {
      if (!draft.formatType.trim()) return "Укажите формат программы.";
      if (draft.priceFromRub == null || Number.isNaN(Number(draft.priceFromRub))) return "Укажите цену «от» (число).";
      if (!draft.currency.trim()) return "Укажите валюту (например RUB).";
      if (!draft.exclusions.trim()) return "Укажите, что не включено.";
      if (!draft.organizerDisplayName.trim()) return "Укажите имя организатора для карточки.";
      if (!draft.trustReason.trim()) return "Заполните блок «почему можно доверять».";
      if (!draft.reviewsSummary.trim()) return "Заполните блок про отзывы / репутацию.";
      if (!draft.whatHappensAfterBooking.trim()) return "Опишите, что происходит после заявки.";
      if (!draft.cta.trim()) return "Укажите призыв к действию (следующий шаг для гостя).";
      return null;
    }
    if (sid === "extra") {
      if (!consent) return "Нужно согласие на обработку заявки.";
      return null;
    }
    return null;
  }

  function goNext() {
    const v = validateCurrentStep();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, maxStep));
  }

  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateCurrentStep();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const meta: ProgramIntakeMetaV2 = {
        wizardVersion: 2,
        supplyTrack,
        programDraft: {
          ...draft,
          priceFromRub: supplyTrack === "verified_style" ? Number(draft.priceFromRub) : null,
        },
      };
      const { id } = await postOrganizerIntake({
        intakeType: "program_submission",
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        organization: organization.trim() || undefined,
        programTitle: programTitle.trim(),
        discipline,
        region: regionValue,
        plannedDates: `${draft.startDate} — ${draft.endDate} (${String(draft.durationDays)} дн.)`,
        message: message.trim() || undefined,
        links: links.trim() || undefined,
        meta,
      });
      void trackProductEvent("program_submitted", {
        page_type: "organizers_program",
        discipline,
        region: regionValue,
        traffic_source: "organizer_intake_wizard",
        intake_id: id,
        supply_track: supplyTrack,
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
          Дальше оператор MyWave Travel свяжется с вами по email, перенесёт данные в карточку программы, добавит медиа и проведёт по шагам
          публикации. Обложку и фото гость увидит только после загрузки в систему — это нормальный этап после заявки.
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

  const sid = stepsMeta[step]?.id;

  return (
    <form className="mw-organizer-form" onSubmit={step === maxStep ? onSubmit : (e) => e.preventDefault()}>
      <p style={{ color: "var(--mw-muted)", maxWidth: "62ch", marginTop: 0 }}>
        Пошаговая форма: сначала базовые данные для публикации, затем — при выборе трека verified / trusted — дополнительный слой полей, как в
        требованиях платформы к полной карточке.
      </p>

      <nav className="mw-organizer-wizard__nav" aria-label="Шаги заявки">
        {stepsMeta.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`mw-organizer-wizard__step${i === step ? " mw-organizer-wizard__step--active" : ""}${i < step ? " mw-organizer-wizard__step--done" : ""}`}
            onClick={() => {
              if (i <= step) {
                setError("");
                setStep(i);
              }
            }}
          >
            <span className="mw-organizer-wizard__step-num">{i + 1}</span>
            <span className="mw-organizer-wizard__step-title">{s.title}</span>
          </button>
        ))}
      </nav>

      {hints && (
        <details className="mw-card" style={{ marginBottom: 20, padding: "14px 16px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 650 }}>Что потребуется для публикации в каталоге</summary>
          <div style={{ marginTop: 12, color: "var(--mw-muted)", lineHeight: 1.55 }}>
            <p style={{ marginTop: 0 }}>
              Ниже — единый чеклист с бэкенда (совпадает с publish gate). В этой заявке нет загрузки медиа: обложку и фото добавит оператор при
              переносе в карточку.
            </p>
            <h3 className="mw-h3">Базовый минимум</h3>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {hints.baseline.map((h) => (
                <li key={h.missingToken} style={{ marginBottom: 8 }}>
                  <strong style={{ color: "var(--mw-text)" }}>{h.hintTitleRu}</strong> — {h.hintBodyRu}
                </li>
              ))}
            </ul>
            <h3 className="mw-h3" style={{ marginTop: 16 }}>
              Дополнительно для verified / trusted
            </h3>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {hints.verifiedExtra.map((h) => (
                <li key={h.missingToken} style={{ marginBottom: 8 }}>
                  <strong style={{ color: "var(--mw-text)" }}>{h.hintTitleRu}</strong> — {h.hintBodyRu}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {sid === "track" && (
        <fieldset className="mw-organizer-form__fieldset">
          <legend>Как вы подаёте программу</legend>
          <p style={{ color: "var(--mw-muted)", marginTop: 0, lineHeight: 1.55 }}>
            <strong style={{ color: "var(--mw-text)" }}>Стандарт</strong> — базовые поля, как для любой публикации.{" "}
            <strong style={{ color: "var(--mw-text)" }}>Verified / trusted слой</strong> — если вы уже verified / trusted_by_platform или
            готовы заполнить карточку в полном объёме сразу (как требует платформа для этого статуса).
          </p>
          <div className="mw-organizer-form__row" style={{ alignItems: "stretch" }}>
            <label
              className={`mw-card mw-organizer-wizard__track${supplyTrack === "standard" ? " mw-organizer-wizard__track--on" : ""}`}
              style={{ flex: 1, cursor: "pointer", padding: 14 }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="supplyTrack"
                  checked={supplyTrack === "standard"}
                  onChange={() => {
                    setSupplyTrack("standard");
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>Стандартная подача</div>
                  <p style={{ margin: "8px 0 0", color: "var(--mw-muted)", lineHeight: 1.5 }}>
                    Без обязательного расширенного блока (цена, exclusions, CTA…). Оператор поможет добрать недостающее перед публикацией.
                  </p>
                </div>
              </div>
            </label>
            <label
              className={`mw-card mw-organizer-wizard__track${supplyTrack === "verified_style" ? " mw-organizer-wizard__track--on" : ""}`}
              style={{ flex: 1, cursor: "pointer", padding: 14 }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="supplyTrack"
                  checked={supplyTrack === "verified_style"}
                  onChange={() => {
                    setSupplyTrack("verified_style");
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>Verified / trusted — полный слой</div>
                  <p style={{ margin: "8px 0 0", color: "var(--mw-muted)", lineHeight: 1.5 }}>
                    Дополнительный шаг с полями качества карточки: цена, включения/исключения, план по дням, доверие, CTA и др.
                  </p>
                </div>
              </div>
            </label>
          </div>
        </fieldset>
      )}

      {sid === "contacts" && (
      <fieldset className="mw-organizer-form__fieldset">
        <legend>Контакты</legend>
        <div className="mw-field">
          <label htmlFor="pi-name">Имя и фамилия / контактное лицо *</label>
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
            <input id="pi-phone" type="tel" className="mw-input" autoComplete="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div className="mw-field">
          <label htmlFor="pi-org">Команда / бренд / юр. лицо</label>
          <input id="pi-org" className="mw-input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </div>
      </fieldset>
      )}

      {sid === "core" && (
      <fieldset className="mw-organizer-form__fieldset">
          <legend>Программа и место</legend>
        <div className="mw-field">
          <label htmlFor="pi-title">Название программы / кэмпа *</label>
          <input id="pi-title" className="mw-input" required value={programTitle} onChange={(e) => setProgramTitle(e.target.value)} />
        </div>
        <div className="mw-organizer-form__row">
          <div className="mw-field">
            <label htmlFor="pi-discipline">Дисциплина *</label>
            <select id="pi-discipline" className="mw-select" required value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
              {DISCIPLINES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
              <label htmlFor="pi-region">Направление (регион) *</label>
              <select id="pi-region" className="mw-select" required value={regionChoice} onChange={(e) => setRegionChoice(e.target.value)}>
              {REGION_PRESETS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value={REGION_CUSTOM}>Другая локация…</option>
            </select>
            {regionChoice === REGION_CUSTOM && (
              <div className="mw-field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label htmlFor="pi-region-custom">Название региона *</label>
                <input
                  id="pi-region-custom"
                  className="mw-input"
                  required
                  value={regionCustom}
                  onChange={(e) => setRegionCustom(e.target.value)}
                    placeholder="Например: Индонезия · Бали"
                  maxLength={200}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        </div>
        <div className="mw-field">
            <label htmlFor="pi-exact">Точное место *</label>
            <input
              id="pi-exact"
              className="mw-input"
              required
              value={draft.exactLocation}
              onChange={(e) => patchDraft("exactLocation", e.target.value)}
              placeholder="Город, база, акватория, трейл — как на публичной карточке"
            />
          </div>
        </fieldset>
      )}

      {sid === "dates" && (
        <fieldset className="mw-organizer-form__fieldset">
          <legend>Даты и длительность</legend>
          <div className="mw-organizer-form__row">
            <div className="mw-field">
              <label htmlFor="pi-start">Дата начала *</label>
              <input
                id="pi-start"
                type="date"
                className="mw-input"
                required
                value={draft.startDate}
                onChange={(e) => patchDraft("startDate", e.target.value)}
              />
            </div>
            <div className="mw-field">
              <label htmlFor="pi-end">Дата окончания *</label>
              <input
                id="pi-end"
                type="date"
                className="mw-input"
                required
                value={draft.endDate}
                onChange={(e) => patchDraft("endDate", e.target.value)}
              />
            </div>
            <div className="mw-field">
              <label htmlFor="pi-dur">Дней *</label>
          <input
                id="pi-dur"
                type="number"
                min={1}
            className="mw-input"
                required
                value={draft.durationDays}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patchDraft("durationDays", Number.isFinite(n) && n > 0 ? n : 1);
                }}
              />
            </div>
          </div>
        </fieldset>
      )}

      {sid === "safety" && (
        <fieldset className="mw-organizer-form__fieldset">
          <legend>Уровень и безопасность</legend>
          <div className="mw-organizer-form__row">
            <div className="mw-field">
              <label htmlFor="pi-level">Уровень подготовки *</label>
              <select
                id="pi-level"
                className="mw-select"
                value={draft.levelRequired}
                onChange={(e) => patchDraft("levelRequired", e.target.value)}
              >
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mw-field">
              <label htmlFor="pi-risk">Риск / интенсивность *</label>
              <select id="pi-risk" className="mw-select" value={draft.riskLevel} onChange={(e) => patchDraft("riskLevel", e.target.value)}>
                {RISK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mw-field">
            <label htmlFor="pi-gear">Экипировка и требования *</label>
            <textarea
              id="pi-gear"
              className="mw-textarea"
              rows={4}
              value={draft.gearRequirements}
              onChange={(e) => patchDraft("gearRequirements", e.target.value)}
            />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-med">Медицинские и прочие ограничения *</label>
            <textarea
              id="pi-med"
              className="mw-textarea"
              rows={3}
              value={draft.medicalLimitations}
              onChange={(e) => patchDraft("medicalLimitations", e.target.value)}
              placeholder="Если ограничений нет — напишите «Нет» или «Не применимо»."
          />
        </div>
        <div className="mw-field">
            <label htmlFor="pi-cancel">Условия отмены и участия *</label>
            <textarea
              id="pi-cancel"
              className="mw-textarea"
              rows={4}
              value={draft.cancellationRules}
              onChange={(e) => patchDraft("cancellationRules", e.target.value)}
            />
          </div>
        </fieldset>
      )}

      {sid === "content" && (
        <fieldset className="mw-organizer-form__fieldset">
          <legend>Содержание карточки</legend>
          <p style={{ color: "var(--mw-muted)", marginTop: 0, lineHeight: 1.55 }}>
            Для публикации нужно хотя бы одно из трёх. В треке verified / trusted — заполните все три поля на этом шаге.
          </p>
          <div className="mw-field">
            <label htmlFor="pi-aud">Для кого программа {supplyTrack === "verified_style" ? "*" : ""}</label>
            <textarea id="pi-aud" className="mw-textarea" rows={3} value={draft.audienceFit} onChange={(e) => patchDraft("audienceFit", e.target.value)} />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-inc">Что включено {supplyTrack === "verified_style" ? "*" : ""}</label>
            <textarea id="pi-inc" className="mw-textarea" rows={4} value={draft.inclusions} onChange={(e) => patchDraft("inclusions", e.target.value)} />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-itin">План по дням {supplyTrack === "verified_style" ? "*" : ""}</label>
          <textarea
              id="pi-itin"
            className="mw-textarea"
            rows={5}
              value={draft.itineraryDayByDay}
              onChange={(e) => patchDraft("itineraryDayByDay", e.target.value)}
            />
          </div>
        </fieldset>
      )}

      {sid === "verified" && (
        <fieldset className="mw-organizer-form__fieldset">
          <legend>Слой verified / trusted</legend>
          <div className="mw-field">
            <label htmlFor="pi-format">Формат программы *</label>
            <input
              id="pi-format"
              className="mw-input"
              value={draft.formatType}
              onChange={(e) => patchDraft("formatType", e.target.value)}
              placeholder="Например: группа до 8 человек, проживание включено…"
            />
          </div>
          <div className="mw-organizer-form__row">
            <div className="mw-field">
              <label htmlFor="pi-price">Цена «от», ₽ или основная валюта *</label>
              <input
                id="pi-price"
                type="number"
                min={0}
                className="mw-input"
                value={draft.priceFromRub ?? ""}
                onChange={(e) => patchDraft("priceFromRub", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <div className="mw-field">
              <label htmlFor="pi-cur">Валюта *</label>
              <input id="pi-cur" className="mw-input" value={draft.currency} onChange={(e) => patchDraft("currency", e.target.value)} />
            </div>
          </div>
          <div className="mw-field">
            <label htmlFor="pi-exc">Что не включено *</label>
            <textarea id="pi-exc" className="mw-textarea" rows={3} value={draft.exclusions} onChange={(e) => patchDraft("exclusions", e.target.value)} />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-oname">Имя организатора в карточке *</label>
            <input
              id="pi-oname"
              className="mw-input"
              value={draft.organizerDisplayName}
              onChange={(e) => patchDraft("organizerDisplayName", e.target.value)}
              placeholder="Как показать в блоке «Организатор»"
            />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-trust">Почему можно доверять *</label>
            <textarea id="pi-trust" className="mw-textarea" rows={3} value={draft.trustReason} onChange={(e) => patchDraft("trustReason", e.target.value)} />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-rev">Отзывы / репутация *</label>
            <textarea
              id="pi-rev"
              className="mw-textarea"
              rows={3}
              value={draft.reviewsSummary}
              onChange={(e) => patchDraft("reviewsSummary", e.target.value)}
            />
          </div>
          <div className="mw-field">
            <label htmlFor="pi-after">Что происходит после заявки *</label>
            <textarea
              id="pi-after"
              className="mw-textarea"
              rows={3}
              value={draft.whatHappensAfterBooking}
              onChange={(e) => patchDraft("whatHappensAfterBooking", e.target.value)}
          />
        </div>
          <div className="mw-field">
            <label htmlFor="pi-cta">Призыв к действию (CTA) *</label>
            <input id="pi-cta" className="mw-input" value={draft.cta} onChange={(e) => patchDraft("cta", e.target.value)} />
          </div>
        </fieldset>
      )}

      {sid === "extra" && (
        <fieldset className="mw-organizer-form__fieldset">
          <legend>Ссылки и комментарий</legend>
        <div className="mw-field">
          <label htmlFor="pi-links">Ссылки (сайт, соцсети, видео)</label>
          <textarea id="pi-links" className="mw-textarea" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} />
        </div>
          <div className="mw-field">
            <label htmlFor="pi-msg">Комментарий для оператора</label>
            <textarea
              id="pi-msg"
              className="mw-textarea"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Всё, что не вошло в шаги выше: особые условия, партнёры, промокоды…"
            />
          </div>
      <label className="mw-organizer-form__consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Соглашаюсь на обработку данных по заявке MyWave Travel и контакт оператора по указанному email / телефону.</span>
      </label>
        </fieldset>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c", margin: "0 0 8px" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        {step > 0 && (
          <button type="button" className="mw-btn mw-btn--ghost" onClick={goBack} disabled={submitting}>
            Назад
          </button>
        )}
        {step < maxStep && (
          <button type="button" className="mw-btn mw-btn--primary" onClick={goNext} disabled={submitting}>
            Далее
          </button>
        )}
        {step === maxStep && (
        <button type="submit" className="mw-btn mw-btn--primary" disabled={submitting}>
          {submitting ? "Отправка…" : "Отправить заявку"}
        </button>
        )}
        <Link href="/organizers/verification" className="mw-btn mw-btn--ghost">
          Про верификацию
        </Link>
      </div>
    </form>
  );
}
