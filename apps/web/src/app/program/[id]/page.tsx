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
  formatType: string | null;
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
  packingListNotes: string | null;
  accommodationNotes: string | null;
  transportNotes: string | null;
  sightsNotes: string | null;
  planBWeatherNotes: string | null;
  platformTravelTips: string | null;
  organizer?: {
    id: string;
    displayName: string;
    verificationStatus: string;
    certificatesSummary?: string | null;
    insuranceSummary?: string | null;
    emergencyPlanSummary?: string | null;
    equipmentSummary?: string | null;
  };
  media: { id: string; url: string; caption: string | null; mediaType: string }[];
};

function buildCatalogHref(next: { discipline?: string; country?: string; region?: string }): string {
  const params = new URLSearchParams();
  if (next.discipline?.trim()) params.set("discipline", next.discipline.trim());
  if (next.country?.trim()) params.set("country", next.country.trim());
  if (next.region?.trim()) params.set("region", next.region.trim());
  const qs = params.toString();
  return qs ? `/?${qs}#programs` : "/#programs";
}

type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

type PublicUgc = {
  id: string;
  authorName: string;
  textReview: string;
  rating: number | null;
  mediaUrls: string[];
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

function organizerVerificationShort(status: string | null | undefined): string {
  switch (status) {
    case "trusted_by_platform":
      return "trusted (платформа)";
    case "verified":
      return "verified (платформа)";
    case "checked":
      return "checked (платформа)";
    case "listed":
      return "listed";
    case "paused":
      return "paused";
    case "rejected":
      return "rejected";
    default:
      return status ?? "—";
  }
}

export default function ProgramPage() {
  const params = useParams();
  const id = params?.id as string;
  const [program, setProgram] = useState<Program | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [ugc, setUgc] = useState<PublicUgc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmInterest, setConfirmInterest] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadError("");
        const [progRes, revRes, ugcRes] = await Promise.all([
          fetch(`${API_URL}/programs/${id}`),
          fetch(`${API_URL}/reviews/public?programId=${encodeURIComponent(id)}`),
          fetch(`${API_URL}/public/program-ugc?programId=${encodeURIComponent(id)}`),
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
        if (ugcRes.ok) {
          const u = await ugcRes.json();
          setUgc(Array.isArray(u) ? u : []);
        } else {
          setUgc([]);
        }
      } catch {
        if (!cancelled) {
          setProgram(null);
          setReviews([]);
          setUgc([]);
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

  useEffect(() => {
    if (!program?.id || typeof window === "undefined") return;
    const storageKey = `mw_booking_idem:${program.id}`;
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) {
      setIdempotencyKey(existing);
      return;
    }
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(storageKey, created);
    setIdempotencyKey(created);
  }, [program?.id]);

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
  const disciplineCatalogHref = buildCatalogHref({ discipline: discipline.original });
  const regionCatalogHref = buildCatalogHref({
    region: program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!guestName.trim() || !guestContact.trim() || !confirmInterest || !idempotencyKey.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const refMatch = typeof document !== "undefined"
        ? document.cookie.match(/(?:^|;\s*)mw_ref=([^;]+)/)
        : null;
      const referralCode = refMatch ? decodeURIComponent(refMatch[1]!) : undefined;
      const res = await fetch(`${API_URL}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey.trim() },
        body: JSON.stringify({
          programId: program.id,
          guestName: guestName.trim(),
          guestContact: guestContact.trim(),
          confirmInterest: true,
          notes: notes.trim() || undefined,
          sourceChannel: "program_page",
          idempotencyKey: idempotencyKey.trim(),
          referralCode,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Не удалось отправить заявку");
      }
      const created = await res.json().catch(() => null);
      void trackProductEvent("program_submitted", {
        page_type: "program_detail",
        program_id: program.id,
        organizer_id: program.organizer?.id,
        discipline: program.discipline,
        region: program.region,
        traffic_source: "program_page_booking",
      });
      setGuestName("");
      setGuestContact("");
      setNotes("");
      setConfirmInterest(false);
      setSubmitSuccess(
        created?.idempotentReplay
          ? "Мы уже получили эту заявку — повторная отправка не создаёт дубликат. Если нужно что-то уточнить, напишите в том же чате/контакте."
          : "Заявка принята. Оператор MyWave свяжется с вами и передаст следующий шаг организатору.",
      );
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
        <Link href={disciplineCatalogHref} className="mw-page-back" style={{ color: "var(--mw-accent)" }}>
          ← К каталогу
        </Link>

        <header className="mw-program-hero">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <Link
              href={disciplineCatalogHref}
              className="mw-badge mw-badge--pilot mw-discipline-badge"
              title="Показать программы по этой дисциплине"
              onClick={() =>
                void trackProductEvent("catalog_filter_click", {
                  page_type: "program_detail",
                  program_id: program.id,
                  organizer_id: program.organizer?.id,
                  filter_type: "discipline",
                  filter_value: discipline.original,
                  traffic_source: "program_detail_chip",
                })
              }
            >
              <span>{discipline.original}</span>
              {discipline.translation && <span className="mw-discipline-badge__translation">{discipline.translation}</span>}
            </Link>
            <Link
              href={regionCatalogHref}
              className="mw-badge mw-badge--pilot"
              title="Показать программы в этом регионе / локации"
              onClick={() =>
                void trackProductEvent("catalog_filter_click", {
                  page_type: "program_detail",
                  program_id: program.id,
                  organizer_id: program.organizer?.id,
                  filter_type: "region",
                  filter_value: program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region,
                  traffic_source: "program_detail_chip",
                })
              }
            >
              {program.region}
            </Link>
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
              {datesLine} · {program.durationDays} дн.
              {program.levelRequired ? ` · ${getProgramLevelLabel(program.levelRequired)}` : ""}
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

        <SectionBlock title="Ключевые параметры">
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: "var(--mw-muted)" }}>
              <strong style={{ color: "var(--mw-text)" }}>Дисциплина:</strong>{" "}
              <Link href={disciplineCatalogHref} style={{ color: "var(--mw-accent)" }}>
                {discipline.translation ? `${discipline.original} / ${discipline.translation}` : discipline.original}
              </Link>
            </p>
            <p style={{ margin: 0, color: "var(--mw-muted)" }}>
              <strong style={{ color: "var(--mw-text)" }}>Регион / место:</strong>{" "}
              <Link href={regionCatalogHref} style={{ color: "var(--mw-accent)" }}>
                {program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region}
              </Link>
            </p>
            <p style={{ margin: 0, color: "var(--mw-muted)" }}>
              <strong style={{ color: "var(--mw-text)" }}>Даты:</strong> {datesLine}
            </p>
            <p style={{ margin: 0, color: "var(--mw-muted)" }}>
              <strong style={{ color: "var(--mw-text)" }}>Длительность:</strong> {program.durationDays} дн.
            </p>
            {program.formatType && (
              <p style={{ margin: 0, color: "var(--mw-muted)" }}>
                <strong style={{ color: "var(--mw-text)" }}>Формат:</strong> {program.formatType}
              </p>
            )}
            {program.priceFromRub != null && (
              <p style={{ margin: 0, color: "var(--mw-muted)" }}>
                <strong style={{ color: "var(--mw-text)" }}>Стоимость:</strong> от{" "}
                {program.priceFromRub.toLocaleString("ru-RU")} {program.currency ?? "₽"}
              </p>
            )}
          </div>
        </SectionBlock>

        {audienceFit && (
          <SectionBlock title="Для кого программа">
            <Prose text={audienceFit} />
          </SectionBlock>
        )}

        {program.levelRequired && (
          <SectionBlock title="Уровень подготовки">
            <p style={{ margin: 0, color: "var(--mw-muted)" }}>
              <strong style={{ color: "var(--mw-text)" }}>Уровень:</strong> {getProgramLevelLabel(program.levelRequired)}
            </p>
          </SectionBlock>
        )}

        {(program.inclusions || program.exclusions) && (
          <SectionBlock title="Что включено и что не включено">
            {program.inclusions && (
              <>
                <h3 className="mw-h3">Что включено</h3>
                <Prose text={program.inclusions} />
              </>
            )}
            {program.exclusions && (
              <>
                <h3 className="mw-h3" style={{ marginTop: program.inclusions ? 16 : 0 }}>
                  Что не включено
                </h3>
                <Prose text={program.exclusions} />
              </>
            )}
          </SectionBlock>
        )}

        {(program.packingListNotes?.trim() ||
          program.accommodationNotes?.trim() ||
          program.transportNotes?.trim() ||
          program.sightsNotes?.trim() ||
          program.planBWeatherNotes?.trim()) && (
          <SectionBlock title="Поездка: практические детали (организатор)">
            <p style={{ margin: "0 0 14px", color: "var(--mw-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
              Блоки ниже заполняет организатор. Уточняйте спорные моменты напрямую перед оплатой / подтверждением участия.
            </p>
            {program.packingListNotes?.trim() && (
              <>
                <h3 className="mw-h3">Что взять с собой</h3>
                <Prose text={program.packingListNotes.trim()} />
              </>
            )}
            {program.accommodationNotes?.trim() && (
              <>
                <h3 className="mw-h3" style={{ marginTop: program.packingListNotes?.trim() ? 16 : 0 }}>
                  Где жить
                </h3>
                <Prose text={program.accommodationNotes.trim()} />
              </>
            )}
            {program.transportNotes?.trim() && (
              <>
                <h3 className="mw-h3" style={{ marginTop: 16 }}>
                  Как добраться
                </h3>
                <Prose text={program.transportNotes.trim()} />
              </>
            )}
            {program.sightsNotes?.trim() && (
              <>
                <h3 className="mw-h3" style={{ marginTop: 16 }}>
                  Что посмотреть рядом
                </h3>
                <Prose text={program.sightsNotes.trim()} />
              </>
            )}
            {program.planBWeatherNotes?.trim() && (
              <>
                <h3 className="mw-h3" style={{ marginTop: 16 }}>
                  План Б (погода и форс-мажор)
                </h3>
                <Prose text={program.planBWeatherNotes.trim()} />
              </>
            )}
          </SectionBlock>
        )}

        {program.platformTravelTips?.trim() && (
          <section className="mw-content-section">
            <h2 className="mw-h2">Подсказки MyWave</h2>
            <div
              className="mw-card"
              style={{
                marginTop: 8,
                background: "rgba(99, 102, 241, 0.06)",
                borderColor: "rgba(99, 102, 241, 0.22)",
              }}
            >
              <p style={{ margin: "0 0 10px", color: "var(--mw-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
                Нейтральные ориентиры платформы. Они <strong>не заменяют</strong> ответ организатора и не являются договором.
              </p>
              <Prose text={program.platformTravelTips.trim()} />
            </div>
          </section>
        )}

        {itinerary && (
          <SectionBlock title="Программа / план">
            <Prose text={itinerary} />
          </SectionBlock>
        )}

        {(program.organizerName || program.organizer) && (
          <SectionBlock title="Организатор">
            <p style={{ margin: 0, color: "var(--mw-muted)", lineHeight: 1.55 }}>
              {program.organizerName ?? program.organizer?.displayName}
            </p>
            {program.organizer?.verificationStatus && (
              <p style={{ margin: "10px 0 0", color: "var(--mw-muted)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--mw-text)" }}>Статус проверки:</strong>{" "}
                {organizerVerificationShort(program.organizer.verificationStatus)}
              </p>
            )}
            {(program.organizer?.certificatesSummary?.trim() ||
              program.organizer?.insuranceSummary?.trim() ||
              program.organizer?.emergencyPlanSummary?.trim() ||
              program.organizer?.equipmentSummary?.trim()) && (
              <div style={{ marginTop: 14 }}>
                <h3 className="mw-h3">Безопасность и подготовка (по данным организатора)</h3>
                {program.organizer.certificatesSummary?.trim() && (
                  <>
                    <p style={{ margin: "12px 0 4px", fontWeight: 650, color: "var(--mw-text)" }}>Сертификаты / квалификация</p>
                    <Prose text={program.organizer.certificatesSummary.trim()} />
                  </>
                )}
                {program.organizer.insuranceSummary?.trim() && (
                  <>
                    <p style={{ margin: "12px 0 4px", fontWeight: 650, color: "var(--mw-text)" }}>Страхование</p>
                    <Prose text={program.organizer.insuranceSummary.trim()} />
                  </>
                )}
                {program.organizer.emergencyPlanSummary?.trim() && (
                  <>
                    <p style={{ margin: "12px 0 4px", fontWeight: 650, color: "var(--mw-text)" }}>План на случай ЧП</p>
                    <Prose text={program.organizer.emergencyPlanSummary.trim()} />
                  </>
                )}
                {program.organizer.equipmentSummary?.trim() && (
                  <>
                    <p style={{ margin: "12px 0 4px", fontWeight: 650, color: "var(--mw-text)" }}>Оборудование и резерв</p>
                    <Prose text={program.organizer.equipmentSummary.trim()} />
                  </>
                )}
              </div>
            )}
          </SectionBlock>
        )}

        {program.cancellationRules && (
          <SectionBlock title="Условия участия / отмены">
            <Prose text={program.cancellationRules} />
          </SectionBlock>
        )}

        {(program.riskLevel || medical || gear) && (
          <SectionBlock title="Риски / безопасность / ограничения">
            {program.riskLevel && (
              <p style={{ margin: "0 0 10px", color: "var(--mw-muted)" }}>
                <strong style={{ color: "var(--mw-text)" }}>Оценка риска / интенсивности:</strong> {getSeverityLabel(program.riskLevel)}
              </p>
            )}
            {gear && (
              <>
                <h3 className="mw-h3">Экипировка и требования (организатор)</h3>
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

        {afterBooking && (
          <SectionBlock title="Что происходит после заявки">
            <Prose text={afterBooking} />
          </SectionBlock>
        )}

        {trustReason && (
          <SectionBlock title="Почему этой программе можно доверять">
            <Prose text={trustReason} />
          </SectionBlock>
        )}

        {program.cta && (
          <SectionBlock title="Следующий шаг">
            <Prose text={program.cta} />
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

        {ugc.length > 0 && (
          <section className="mw-content-section">
            <h2 className="mw-h2">Реальные участники</h2>
            <p style={{ color: "var(--mw-muted)", margin: "0 0 16px", lineHeight: 1.55 }}>
              Отзывы и медиа от людей, которые уже завершили поездку. Публикуются после модерации и только с согласием автора.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {ugc.map((entry) => (
                <li key={entry.id} className="mw-card" style={{ marginBottom: 16 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 650 }}>
                    {entry.authorName}
                    {entry.rating != null && (
                      <span style={{ marginLeft: 10, color: "var(--mw-muted)", fontWeight: 500 }}>
                        {"★".repeat(entry.rating)}
                      </span>
                    )}
                    <span style={{ fontWeight: 500, color: "var(--mw-muted)", marginLeft: 10 }}>
                      {new Date(entry.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </p>
                  <Prose text={entry.textReview} />
                  {Array.isArray(entry.mediaUrls) && entry.mediaUrls.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      {entry.mediaUrls.map((url, idx) => {
                        const isImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);
                        if (isImage) {
                          return (
                            <a key={idx} href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt={`${entry.authorName} — медиа ${idx + 1}`}
                                style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }}
                                loading="lazy"
                              />
                            </a>
                          );
                        }
                        return (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: 120,
                              border: "1px dashed var(--mw-border, #d1d5db)",
                              borderRadius: 8,
                              fontSize: 13,
                              color: "var(--mw-accent)",
                              padding: 8,
                              textAlign: "center",
                            }}
                          >
                            Медиафайл
                          </a>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
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
              <label htmlFor="guestName">Как к вам обращаться</label>
              <input
                id="guestName"
                className="mw-input"
                style={{ width: "100%", minWidth: 0 }}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Имя или короткое обращение"
                disabled={submitting}
                autoComplete="name"
              />
            </div>
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
            <label className="mw-field" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
              <input
                type="checkbox"
                checked={confirmInterest}
                onChange={(e) => setConfirmInterest(e.target.checked)}
                disabled={submitting}
                style={{ marginTop: 4 }}
              />
              <span style={{ color: "var(--mw-muted)", lineHeight: 1.55 }}>
                Подтверждаю, что хочу узнать детали участия именно в этой программе и согласен(на) на связь по указанному контакту.
              </span>
            </label>
            <button
              type="submit"
              disabled={submitting || !guestName.trim() || !guestContact.trim() || !confirmInterest || !idempotencyKey.trim()}
              className="mw-btn mw-btn--primary"
            >
              {submitting ? "Отправляем…" : "Отправить заявку"}
            </button>
            <p className="mw-form-note">
              После отправки оператор уточнит детали и передаст следующий шаг организатору. Повторная отправка с этой страницы не создаёт дубликат
              заявки.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
