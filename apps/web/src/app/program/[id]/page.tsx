"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  getProgramLevelLabel,
  getSeverityLabel,
} from "@mywave/shared-types";
import { getProgramFieldOverrides, mergeProgramField } from "../../../content/programPageOverrides";
import { getDisciplineDisplay } from "../../../lib/disciplineLabels";
import { presentProgramMediaUrl } from "../../../lib/programCardCover";
import { trackProductEvent } from "../../../lib/analytics/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Program = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  levelRequired: string | null;
  riskLevel: string | null;
  priceFromRub: number | null;
  currency: string | null;
  audienceFit: string | null;
  itineraryDayByDay: string | null;
  inclusions: string | null;
  exclusions: string | null;
  gearRequirements: string | null;
  medicalLimitations: string | null;
  cancellationRules: string | null;
  organizerName: string | null;
  trustReason: string | null;
  whatHappensAfterBooking: string | null;
  cta: string | null;
  organizer?: { id: string; displayName: string; verificationStatus: string };
  media: { id: string; url: string; caption: string | null; mediaType: string }[];
};

type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mw-content-section">
      <h2 className="mw-h2">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <p style={{ whiteSpace: "pre-wrap", margin: 0, color: "var(--mw-muted)", lineHeight: 1.65 }}>
      {text}
    </p>
  );
}

export default function ProgramPage() {
  const params = useParams();
  const id = params?.id as string;
  const [program, setProgram] = useState<Program | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadError("");
        const [progRes, revRes] = await Promise.all([
          fetch(`${API_URL}/programs/${id}`),
          fetch(`${API_URL}/reviews/public?programId=${encodeURIComponent(id)}`),
        ]);
        if (cancelled) return;
        if (progRes.ok) {
          const p = await progRes.json();
          setProgram(p);
          void trackProductEvent("page_view", {
            page_type: "program_detail",
            program_id: p.id,
            organizer_id: p.organizer?.id,
            discipline: p.discipline,
            region: p.region,
            traffic_source: "program_page",
          });
          void trackProductEvent("view_item", {
            page_type: "program_detail",
            program_id: p.id,
            organizer_id: p.organizer?.id,
            discipline: p.discipline,
            region: p.region,
            traffic_source: "program_page",
          });
        } else {
          setProgram(null);
        }
        if (revRes.ok) {
          const r = await revRes.json();
          setReviews(Array.isArray(r) ? r : []);
        } else {
          setReviews([]);
        }
      } catch {
        if (!cancelled) {
          setProgram(null);
          setReviews([]);
          setLoadError("Сервис программ временно недоступен. Обновите страницу через несколько секунд.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const overrides = useMemo(() => (program ? getProgramFieldOverrides(program.title) : {}), [program]);

  if (loading) {
    return (
      <main className="mw-container" style={{ padding: "3rem 0" }}>
        <p style={{ color: "var(--mw-muted)" }}>Загрузка…</p>
      </main>
    );
  }
  if (!program) {
    return (
      <main className="mw-container" style={{ padding: "3rem 0" }}>
        <p>{loadError || "Программа не найдена."}</p>
        <Link href="/" className="mw-page-back">
          ← На главную
        </Link>
      </main>
    );
  }

  const audienceFit = mergeProgramField(program.audienceFit, overrides.audienceFit);
  const itinerary = mergeProgramField(program.itineraryDayByDay, overrides.itineraryDayByDay);
  const trustReason = mergeProgramField(program.trustReason, overrides.trustReason);
  const afterBooking = mergeProgramField(program.whatHappensAfterBooking, overrides.whatHappensAfterBooking);
  const gear = mergeProgramField(program.gearRequirements, overrides.gearRequirements);
  const medical = mergeProgramField(program.medicalLimitations, overrides.medicalLimitations);
  const discipline = getDisciplineDisplay(program.discipline);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!guestContact.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const res = await fetch(`${API_URL}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          guestContact: guestContact.trim(),
          notes: notes.trim() || undefined,
          sourceChannel: "program_page",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Не удалось отправить заявку");
      }
      void trackProductEvent("program_submitted", {
        page_type: "program_detail",
        program_id: program.id,
        organizer_id: program.organizer?.id,
        discipline: program.discipline,
        region: program.region,
        traffic_source: "program_page_booking",
      });
      setGuestContact("");
      setNotes("");
      setSubmitSuccess("Заявка отправлена. Оператор MyWave свяжется с вами в течение 24 часов.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  };

  const datesLine = `${new Date(program.startDate).toLocaleDateString("ru-RU")} – ${new Date(program.endDate).toLocaleDateString("ru-RU")}`;

  return (
    <main style={{ padding: "clamp(1.5rem, 4vw, 2rem) 0 4rem", background: "var(--mw-bg)" }}>
      <div className="mw-container" style={{ maxWidth: 720 }}>
        <Link href="/" className="mw-page-back" style={{ color: "var(--mw-accent)" }}>
          ← К каталогу
        </Link>

        <header className="mw-program-hero">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <span className="mw-badge mw-badge--pilot mw-discipline-badge">
              <span>{discipline.original}</span>
              {discipline.translation && <span className="mw-discipline-badge__translation">{discipline.translation}</span>}
            </span>
            <span className="mw-badge mw-badge--pilot">{program.region}</span>
            {program.levelRequired && <span className="mw-badge mw-badge--soon">Уровень: {getProgramLevelLabel(program.levelRequired)}</span>}
          </div>
          <h1 className="mw-h1" style={{ maxWidth: "none" }}>
            {program.title}
          </h1>
          <p style={{ color: "var(--mw-muted)", margin: "0 0 12px", fontSize: "1.02rem" }}>
            {discipline.translation ? `${discipline.original} / ${discipline.translation}` : discipline.original} · {program.region}
            {program.exactLocation && ` · ${program.exactLocation}`}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "baseline", marginBottom: 16 }}>
            {program.priceFromRub != null && (
              <span style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                от {program.priceFromRub.toLocaleString("ru-RU")} {program.currency ?? "₽"}
              </span>
            )}
            <span style={{ color: "var(--mw-muted)", fontSize: "0.95rem" }}>
              {datesLine} · {program.durationDays} дн. · {getProgramLevelLabel(program.levelRequired)}
            </span>
          </div>
          <a href="#request" className="mw-btn mw-btn--primary">
            Оставить заявку
          </a>
        </header>

        <div
          className="mw-card"
          style={{
            marginBottom: 28,
            background: "var(--mw-accent-soft)",
            borderColor: "rgba(13,148,136,0.3)",
          }}
        >
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            Заявки по этой программе открыты. Команда MyWave свяжется с вами, уточнит детали и передаст следующий шаг организатору.
          </p>
        </div>

        {audienceFit && (
          <SectionBlock title="Для кого программа">
            <Prose text={audienceFit} />
          </SectionBlock>
        )}

        {itinerary && (
          <SectionBlock title="По дням">
            <Prose text={itinerary} />
          </SectionBlock>
        )}

        {(program.inclusions || program.exclusions) && (
          <SectionBlock title="Что включено и что нет">
            {program.inclusions && (
              <>
                <h3 className="mw-h3">Включено</h3>
                <Prose text={program.inclusions} />
              </>
            )}
            {program.exclusions && (
              <>
                <h3 className="mw-h3" style={{ marginTop: program.inclusions ? 16 : 0 }}>
                  Не включено
                </h3>
                <Prose text={program.exclusions} />
              </>
            )}
          </SectionBlock>
        )}

        <SectionBlock title="Уровень и безопасность">
          <p style={{ margin: "0 0 8px", color: "var(--mw-muted)" }}>
            <strong style={{ color: "var(--mw-text)" }}>Уровень:</strong> {getProgramLevelLabel(program.levelRequired)}
          </p>
          {program.riskLevel && (
            <p style={{ margin: 0, color: "var(--mw-muted)" }}>
              <strong style={{ color: "var(--mw-text)" }}>Оценка риска / интенсивности:</strong> {getSeverityLabel(program.riskLevel)}
            </p>
          )}
        </SectionBlock>

        {(gear || medical) && (
          <SectionBlock title="Экипировка и ограничения">
            {gear && (
              <>
                <h3 className="mw-h3">Экипировка</h3>
                <Prose text={gear} />
              </>
            )}
            {medical && (
              <>
                <h3 className="mw-h3" style={{ marginTop: gear ? 16 : 0 }}>
                  Медицинские и прочие ограничения
                </h3>
                <Prose text={medical} />
              </>
            )}
          </SectionBlock>
        )}

        {trustReason && (
          <SectionBlock title="Почему этой программе можно доверять">
            <Prose text={trustReason} />
          </SectionBlock>
        )}

        {program.cancellationRules && (
          <SectionBlock title="Условия отмены">
            <Prose text={program.cancellationRules} />
          </SectionBlock>
        )}

        {afterBooking && (
          <SectionBlock title="Что будет после заявки">
            <Prose text={afterBooking} />
          </SectionBlock>
        )}

        {(program.organizerName || program.organizer) && (
          <SectionBlock title="Организатор">
            <p style={{ margin: 0, color: "var(--mw-muted)", lineHeight: 1.55 }}>
              {program.organizerName ?? program.organizer?.displayName}
            </p>
          </SectionBlock>
        )}

        {program.media?.length > 0 && (
          <SectionBlock title="Медиа">
            {program.media.map((m) => (
              <div key={m.id} style={{ marginBottom: 16 }}>
                {m.mediaType === "image" ? (
                  <img src={presentProgramMediaUrl(m.url) ?? m.url} alt={m.caption ?? ""} style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }} />
                ) : (
                  <a href={m.url} target="_blank" rel="noreferrer">
                    {m.caption ?? m.url}
                  </a>
                )}
              </div>
            ))}
          </SectionBlock>
        )}

        <section className="mw-content-section">
          <h2 className="mw-h2">Отзывы гостей</h2>
          {reviews.length === 0 ? (
            <p style={{ color: "var(--mw-muted)", margin: 0, lineHeight: 1.55 }}>
              Пока нет одобренных отзывов для этой программы. Отзывы публикуются после поездки и проходят модерацию.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {reviews.map((r) => (
                <li key={r.id} className="mw-card" style={{ marginBottom: 12 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 650 }}>
                    {"★".repeat(r.rating)}
                    <span style={{ fontWeight: 500, color: "var(--mw-muted)", marginLeft: 8 }}>
                      {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </p>
                  {r.comment && <Prose text={r.comment} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="request" className="mw-form-card">
          <h2 className="mw-h2">Оставить заявку</h2>
          <p className="mw-form-hint">
            MyWave сопровождает заявку: оператор уточнит ваш уровень, даты и передаст контакт организатору.
          </p>
          {submitError && <p style={{ color: "#b00020", marginBottom: 12 }}>{submitError}</p>}
          {submitSuccess && <p style={{ color: "#047857", marginBottom: 12, fontWeight: 600 }}>{submitSuccess}</p>}
          <form onSubmit={handleSubmit}>
            <div className="mw-field" style={{ marginBottom: 16 }}>
              <label htmlFor="guestContact">Телефон, Telegram или email</label>
              <input
                id="guestContact"
                className="mw-input"
                style={{ width: "100%", minWidth: 0 }}
                value={guestContact}
                onChange={(e) => setGuestContact(e.target.value)}
                placeholder="+7…, @telegram или почта"
                disabled={submitting}
                autoComplete="tel"
              />
            </div>
            <div className="mw-field" style={{ marginBottom: 20 }}>
              <label htmlFor="notes">Комментарий для оператора</label>
              <textarea
                id="notes"
                className="mw-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ваш уровень, желаемые даты, кто едет, что важно по поездке"
                rows={4}
                disabled={submitting}
              />
            </div>
            <button type="submit" disabled={submitting || !guestContact.trim()} className="mw-btn mw-btn--primary">
              {submitting ? "Отправляем…" : "Отправить заявку"}
            </button>
            <p className="mw-form-note">
              После отправки мы подтверждаем детали участия и следующий шаг по бронированию.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
