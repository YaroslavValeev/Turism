"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { exploreNavLinkFromRaw } from "@mywave/explore-links";
import { getProgramLevelLabel, getSeverityLabel } from "@mywave/shared-types";
import { getProgramFieldOverrides, mergeProgramField } from "../../../content/programPageOverrides";
import { getDisciplineDisplay } from "../../../lib/disciplineLabels";
import { buildInternalContentQuery } from "../../../lib/internalContentUtm";
import { validExploreMainLinks } from "../../../lib/exploreNavWeb";
import { orderProgramMediaForDisplay, presentProgramMediaUrl } from "../../../lib/programCardCover";
import { extractLabeledFieldValue, resolveProgramField } from "../../../lib/recommendedProgramFields";
import { trackProductEvent } from "../../../lib/analytics/client";

import { getPublicApiBase } from "../../../lib/publicApiBase";

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
  accommodationDetails?: string | null;
  transferDetails?: string | null;
  cta: string | null;
  autoPublished?: boolean;
  sourceType?: string | null;
  sourceUrl?: string | null;
  reviewStatus?: string | null;
  ingestedAt?: string | null;
  updatedFromSourceAt?: string | null;
  organizer?: { id: string; displayName: string; verificationStatus: string };
  media: { id: string; url: string; caption: string | null; mediaType: string }[];
};

function sourceTypeLabelRuPdp(t: string | null | undefined): string {
  const k = String(t ?? "").toLowerCase();
  if (k === "instagram") return "Instagram";
  if (k === "telegram") return "Telegram";
  if (k === "rss") return "RSS";
  if (k === "site" || k === "website") return "сайт организатора";
  return t ? t : "источник";
}

type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

function buildCatalogHref(next: { discipline?: string; region?: string }): string {
  const params = new URLSearchParams();
  if (next.discipline?.trim()) params.set("discipline", next.discipline.trim());
  if (next.region?.trim()) params.set("region", next.region.trim());
  const qs = params.toString();
  return qs ? `/?${qs}#programs` : "/#programs";
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mw-content-section">
      <h2 className="mw-h2">{title}</h2>
      {children}
    </section>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;

function renderTextWithLinks(text: string): ReactNode[] {
  const lines = text.split(/\r?\n/);
  const nodes: ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const parts = line.split(URL_PATTERN);
    parts.forEach((part, partIndex) => {
      if (!part) return;
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        nodes.push(
          <a
            key={`lnk-${lineIndex}-${partIndex}`}
            href={part}
            target="_blank"
            rel="nofollow noopener noreferrer"
            style={{ color: "var(--mw-accent)", textDecoration: "underline" }}
          >
            {part}
          </a>,
        );
      } else {
        nodes.push(<span key={`txt-${lineIndex}-${partIndex}`}>{part}</span>);
      }
    });
    if (lineIndex < lines.length - 1) nodes.push(<br key={`br-${lineIndex}`} />);
  });

  return nodes;
}

function Prose({ text }: { text: string }) {
  return (
    <p style={{ whiteSpace: "pre-wrap", margin: 0, color: "var(--mw-muted)", lineHeight: 1.65 }}>
      {renderTextWithLinks(text)}
    </p>
  );
}

function ProgramInfoField({
  label,
  value,
}: {
  label: string;
  value: { mode: "confirmed" | "recommended"; text: string };
}) {
  return (
    <div>
      <h3 className="mw-h3">{label}</h3>
      <p className={value.mode === "recommended" ? "recommended-field" : ""} style={{ whiteSpace: "pre-wrap", margin: 0, color: "var(--mw-muted)", lineHeight: 1.65 }}>
        {renderTextWithLinks(value.text)}
      </p>
    </div>
  );
}

function linesToBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem", color: "var(--mw-muted)", lineHeight: 1.55 }}>
      {items.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function organizerVerificationLabelRu(status: string | null | undefined): string {
  switch (status) {
    case "trusted_by_platform":
      return "Профиль: данные проверены платформой (стадия trusted)";
    case "verified":
      return "Профиль: данные проверены платформой (стадия verified)";
    case "checked":
      return "Профиль: проверка данных (стадия checked)";
    case "listed":
      return "Профиль: базовая публикация в каталоге";
    case "paused":
      return "Профиль: публикация приостановлена";
    case "rejected":
      return "Профиль: заявка отклонена";
    default:
      return status ? `Статус публикации: ${status}` : "Статус публикации: не указан";
  }
}

const DEFAULT_AFTER_STEPS = [
  "Вы отправляете заявку через форму на сайте.",
  "Команда MyWaveTour при необходимости уточняет детали и передаёт заявку организатору.",
  "Организатор подтверждает наличие мест и условия, связывается с вами.",
  "Дальше вы согласуете участие и оплату напрямую с организатором по его правилам.",
];

type PdpProps = { id: string; validHubKeys: Set<string> };

export function ProgramPdpClient({ id, validHubKeys }: PdpProps) {
  const [program, setProgram] = useState<Program | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [consentTransfer, setConsentTransfer] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [entryTracking, setEntryTracking] = useState<{
    entryType?: string;
    entryId?: string;
    utmSource?: string;
    utmMedium?: string;
    exploreType?: string;
    exploreSlug?: string;
  }>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setEntryTracking({
      entryType: q.get("entry_type") ?? undefined,
      entryId: q.get("entry_id") ?? undefined,
      utmSource: q.get("utm_source") ?? undefined,
      utmMedium: q.get("utm_medium") ?? undefined,
      exploreType: q.get("explore_type") ?? undefined,
      exploreSlug: q.get("explore_slug") ?? undefined,
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadError("");
        const [progRes, revRes] = await Promise.all([
          fetch(`${getPublicApiBase()}/programs/${id}`),
          fetch(`${getPublicApiBase()}/reviews/public?programId=${encodeURIComponent(id)}`),
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

  const reviewStats = useMemo(() => {
    if (reviews.length === 0) return { avg: null as number | null, count: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return { avg: sum / reviews.length, count: reviews.length };
  }, [reviews]);

  const displayMedia = useMemo(() => {
    if (!program?.media?.length) return [] as Program["media"];
    return orderProgramMediaForDisplay(
      program.media,
      `${program.title} ${program.audienceFit ?? ""} ${program.itineraryDayByDay ?? ""}`,
    );
  }, [program]);

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
  const sourceTextScope = [
    program.inclusions,
    program.exclusions,
    itinerary,
    audienceFit,
    trustReason,
  ];
  const isKidsProgram = /дет|kids|подрост/i.test(
    `${program.title} ${program.formatType ?? ""} ${program.audienceFit ?? ""}`
  );
  const isHighRiskProgram =
    /high|critical|extreme|высок/i.test(String(program.riskLevel ?? "")) ||
    /freeride|mountain|альп|фрирайд|горы/i.test(
      `${program.discipline ?? ""} ${program.formatType ?? ""}`
    );
  const equipmentField = resolveProgramField({
    field: "equipment",
    organizerValue: gear,
    discipline: program.discipline,
    programFormat: program.formatType,
    isKids: isKidsProgram,
    isHighRisk: isHighRiskProgram,
  });
  const accommodationField = resolveProgramField({
    field: "accommodation",
    organizerValue:
      extractLabeledFieldValue("accommodation", sourceTextScope) ??
      (program.accommodationDetails ?? null),
    discipline: program.discipline,
    programFormat: program.formatType,
    isKids: isKidsProgram,
    isHighRisk: isHighRiskProgram,
  });
  const transferField = resolveProgramField({
    field: "transfer",
    organizerValue:
      extractLabeledFieldValue("transfer", sourceTextScope) ??
      (program.transferDetails ?? null),
    discipline: program.discipline,
    programFormat: program.formatType,
    isKids: isKidsProgram,
    isHighRisk: isHighRiskProgram,
  });
  const discipline = getDisciplineDisplay(program.discipline);
  const disciplineCatalogHref = buildCatalogHref({ discipline: discipline.original });
  const regionCatalogHref = buildCatalogHref({
    region: program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!guestContact.trim()) return;
    if (!consentTransfer || !consentPrivacy) {
      setSubmitError("Нужно согласие на передачу контакта организатору и с политикой конфиденциальности.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const res = await fetch(`${getPublicApiBase()}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          guestContact: guestContact.trim(),
          notes: notes.trim() || undefined,
          legalConsent: true,
          sourceChannel: "program_page",
          sourceCampaign: "g4_entry_tracking",
          entryType: entryTracking.entryType,
          entryId: entryTracking.entryId,
          utmSource: entryTracking.utmSource,
          utmMedium: entryTracking.utmMedium,
          exploreType: entryTracking.exploreType,
          exploreSlug: entryTracking.exploreSlug,
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
        entry_type: entryTracking.entryType ?? null,
        entry_id: entryTracking.entryId ?? null,
        utm_source: entryTracking.utmSource ?? null,
        utm_medium: entryTracking.utmMedium ?? null,
        explore_type: entryTracking.exploreType ?? null,
        explore_slug: entryTracking.exploreSlug ?? null,
      });
      setGuestContact("");
      setNotes("");
      setSubmitSuccess("Организатор получил твою заявку. Обычно отвечают в течение 24 часов.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  };

  const datesLine = `${new Date(program.startDate).toLocaleDateString("ru-RU")} – ${new Date(program.endDate).toLocaleDateString("ru-RU")}`;
  const seasonRu =
    seasonOfProgramStart(program) === "winter"
      ? "Зима"
      : seasonOfProgramStart(program) === "spring"
        ? "Весна"
        : seasonOfProgramStart(program) === "summer"
          ? "Лето"
          : "Осень";

  const inclusionLines = program.inclusions ? linesToBullets(program.inclusions) : [];
  const exclusionLines = program.exclusions ? linesToBullets(program.exclusions) : [];

  const programEntryQuery = buildInternalContentQuery("program", program.id);
  const exploreHubLinks = validExploreMainLinks(
    [
      exploreNavLinkFromRaw("discipline", program.discipline),
      exploreNavLinkFromRaw("region", program.region),
      exploreNavLinkFromRaw("season", seasonRawForProgramHub(program)),
    ],
    validHubKeys,
  );

  return (
    <main className="mw-pdp-root">
      <div className="mw-container mw-pdp-layout">
        <div className="mw-pdp-main">
          <Link href="/" className="mw-page-back" style={{ color: "var(--mw-accent)" }}>
            ← К каталогу
          </Link>

          <header className="mw-program-hero">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              <Link href={disciplineCatalogHref} className="mw-badge mw-badge--pilot mw-discipline-badge">
                <span>{discipline.original}</span>
                {discipline.translation && <span className="mw-discipline-badge__translation">{discipline.translation}</span>}
              </Link>
              <Link href={regionCatalogHref} className="mw-badge mw-badge--pilot">
                {program.region}
              </Link>
              {program.levelRequired && <span className="mw-badge mw-badge--soon">Уровень: {getProgramLevelLabel(program.levelRequired)}</span>}
              {program.formatType && <span className="mw-badge mw-badge--soon">Формат: {program.formatType}</span>}
            </div>
            <h1 className="mw-h1" style={{ maxWidth: "none" }}>
              {program.title}
            </h1>
            <p style={{ color: "var(--mw-muted)", margin: "0 0 12px", fontSize: "1.02rem" }}>
              {discipline.translation ? `${discipline.original} / ${discipline.translation}` : discipline.original} · {program.region}
              {program.exactLocation && ` · ${program.exactLocation}`}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "baseline", marginBottom: 12 }}>
              {program.priceFromRub != null && (
                <span style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                  от {program.priceFromRub.toLocaleString("ru-RU")} {program.currency ?? "₽"}
                </span>
              )}
              <span style={{ color: "var(--mw-muted)", fontSize: "0.95rem" }}>
                {datesLine} · {program.durationDays} дн.
              </span>
            </div>
            {reviewStats.count > 0 && reviewStats.avg != null && (
              <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.95rem" }}>
                Отзывы участников: {reviewStats.avg.toFixed(1)} ★ ({reviewStats.count}{" "}
                {reviewStats.count === 1 ? "отзыв" : reviewStats.count < 5 ? "отзыва" : "отзывов"})
              </p>
            )}
            {reviewStats.count === 0 && (
            <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.95rem" }}>Пока нет отзывов по этой программе в MyWaveTour.</p>
            )}
            <a href="#request" className="mw-btn mw-btn--primary">
              Забронировать место
            </a>
            <p style={{ margin: "10px 0 0", fontSize: "0.9rem", color: "var(--mw-muted)", lineHeight: 1.45 }}>
              Остались вопросы? Напиши - подскажем
            </p>
            <p style={{ margin: "8px 0 0" }}>
              <Link href={`/organizers/program?${programEntryQuery}`} className="mw-btn mw-btn--ghost" prefetch={false}>
                Задать вопрос
              </Link>
            </p>
            <p className="mw-pdp-cta-note" style={{ margin: "12px 0 0", fontSize: "0.92rem", color: "var(--mw-muted)", maxWidth: "52ch", lineHeight: 1.55 }}>
              После отправки заявки организатор подтверждает наличие мест и связывается с участником. Данные программы предоставлены организатором.
            </p>
          </header>

          <div className="mw-card mw-pdp-disclaimer" style={{ marginBottom: 24, borderColor: "rgba(13,148,136,0.25)" }}>
            <p style={{ margin: 0, lineHeight: 1.55, fontSize: "0.95rem", color: "var(--mw-muted)" }}>
              Ты выбираешь программу, организатор подтверждает детали и места. MyWaveTour помогает вам быстрее перейти к живому диалогу.
            </p>
          </div>

          {exploreHubLinks.length > 0 && (
            <div className="mw-card" style={{ marginBottom: 24, borderColor: "var(--mw-border)" }}>
              <h2 className="mw-h2" style={{ fontSize: "1.1rem", marginTop: 0, marginBottom: 12 }}>
                Смотреть ещё по теме
              </h2>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.92rem", color: "var(--mw-muted)" }}>
                Если этот формат не подходит - вот похожие варианты:
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {exploreHubLinks.map((l) => (
                  <li key={`${l.type}-${l.slug}`}>
                    <Link
                      href={`${l.path}?${programEntryQuery}`}
                      style={{ color: "var(--mw-accent)", fontWeight: 600 }}
                    >
                      {l.type === "discipline" && "Дисциплина: "}
                      {l.type === "region" && "Регион: "}
                      {l.type === "season" && "Сезон: "}
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {program.autoPublished && (
            <div
              className="mw-card"
              style={{
                marginBottom: 24,
                borderColor: "var(--mw-border)",
                background: "var(--mw-bg-warm)",
              }}
            >
              <p style={{ margin: 0, lineHeight: 1.55, fontSize: "0.95rem", color: "var(--mw-muted)" }}>
                <span className="mw-badge mw-badge--soon" style={{ marginRight: 8 }}>
                  Автокаталог
                </span>
                Карточка собрана из открытого источника ({sourceTypeLabelRuPdp(program.sourceType)}).
                {program.reviewStatus === "auto_pending" && " Сейчас на лёгкой проверке редактором."}
                {program.sourceUrl && (
                  <>
                    {" "}
                    <a href={program.sourceUrl} rel="nofollow noopener noreferrer" target="_blank" style={{ color: "var(--mw-accent)" }}>
                      Перейти к источнику
                    </a>
                    .
                  </>
                )}
                {program.updatedFromSourceAt && (
                  <span style={{ display: "block", marginTop: 6, fontSize: "0.88rem", color: "var(--mw-muted2)" }}>
                    Обновлено с источника: {new Date(program.updatedFromSourceAt).toLocaleString("ru-RU")}
                  </span>
                )}
              </p>
            </div>
          )}

          <SectionBlock title="Ключевые детали">
            <div className="mw-pdp-details-grid">
              <div>
                <strong>Длительность</strong>
                <div>{program.durationDays} дн.</div>
              </div>
              <div>
                <strong>Дисциплина</strong>
                <div>
                  <Link href={disciplineCatalogHref} style={{ color: "var(--mw-accent)" }}>
                    {discipline.original}
                  </Link>
                </div>
              </div>
              <div>
                <strong>Регион</strong>
                <div>
                  <Link href={regionCatalogHref} style={{ color: "var(--mw-accent)" }}>
                    {program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region}
                  </Link>
                </div>
              </div>
              <div>
                <strong>Сезон старта</strong>
                <div>{seasonRu}</div>
              </div>
              <div>
                <strong>Уровень</strong>
                <div>{getProgramLevelLabel(program.levelRequired)}</div>
              </div>
              {program.formatType && (
                <div>
                  <strong>Тип программы</strong>
                  <div>{program.formatType}</div>
                </div>
              )}
              {program.riskLevel && (
                <div>
                  <strong>Уровень риска / интенсивности</strong>
                  <div>{getSeverityLabel(program.riskLevel)}</div>
                </div>
              )}
            </div>
          </SectionBlock>

          <section className="mw-content-section">
            <h2 className="mw-h2">Отзывы участников</h2>
            {reviews.length === 0 ? (
              <p style={{ color: "var(--mw-muted)", margin: 0, lineHeight: 1.55 }}>
                Пока нет одобренных отзывов для этой программы. Отзывы публикуются после завершённой поездки и модерации.
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

          {audienceFit && (
            <SectionBlock title="Для кого программа">
              <Prose text={audienceFit} />
            </SectionBlock>
          )}

          {(program.inclusions || program.exclusions) && (
            <SectionBlock title="Включено и не включено">
              <div className="mw-pdp-two-col">
                <div>
                  <h3 className="mw-h3">Включено</h3>
                  {inclusionLines.length > 0 ? (
                    <BulletList items={inclusionLines} />
                  ) : program.inclusions ? (
                    <Prose text={program.inclusions} />
                  ) : (
                    <p style={{ color: "var(--mw-muted)", margin: 0 }}>Организатор не указал отдельным списком.</p>
                  )}
                </div>
                <div>
                  <h3 className="mw-h3">Не включено</h3>
                  {exclusionLines.length > 0 ? (
                    <BulletList items={exclusionLines} />
                  ) : program.exclusions ? (
                    <Prose text={program.exclusions} />
                  ) : (
                    <p style={{ color: "var(--mw-muted)", margin: 0 }}>Организатор не указал отдельным списком.</p>
                  )}
                </div>
              </div>
            </SectionBlock>
          )}

          {itinerary && (
            <SectionBlock title="Программа по дням">
              <Prose text={itinerary} />
            </SectionBlock>
          )}

          {(program.riskLevel || medical) && (
            <SectionBlock title="Риск, требования и ограничения">
              {program.riskLevel && (
                <p style={{ margin: "0 0 10px", color: "var(--mw-muted)" }}>
                  <strong style={{ color: "var(--mw-text)" }}>Оценка риска / интенсивности:</strong> {getSeverityLabel(program.riskLevel)}
                </p>
              )}
              {medical && (
                <>
                  <h3 className="mw-h3" style={{ marginTop: 0 }}>
                    Медицинские и прочие ограничения
                  </h3>
                  <Prose text={medical} />
                </>
              )}
            </SectionBlock>
          )}

          <SectionBlock title="Организационные условия">
            <div className="mw-pdp-two-col">
              <ProgramInfoField label="Экипировка" value={equipmentField} />
              <ProgramInfoField label="Тип размещения" value={accommodationField} />
            </div>
            <div style={{ marginTop: 16 }}>
              <ProgramInfoField label="Трансфер" value={transferField} />
            </div>
          </SectionBlock>

          {(program.organizerName || program.organizer) && (
            <SectionBlock title="Об организаторе">
              <p style={{ margin: 0, color: "var(--mw-muted)", lineHeight: 1.55, fontWeight: 650 }}>
                {program.organizerName ?? program.organizer?.displayName}
              </p>
              {program.organizer?.verificationStatus && (
                <p style={{ margin: "10px 0 0", color: "var(--mw-muted)", lineHeight: 1.55, fontSize: "0.95rem" }}>
                  {organizerVerificationLabelRu(program.organizer.verificationStatus)}
                </p>
              )}
              <p style={{ margin: "12px 0 0", fontSize: "0.92rem", color: "var(--mw-muted)" }}>
                <Link href={disciplineCatalogHref}>Все программы с этой дисциплиной в каталоге</Link>
              </p>
            </SectionBlock>
          )}

          {program.cancellationRules && (
            <SectionBlock title="Условия участия и отмены">
              <Prose text={program.cancellationRules} />
            </SectionBlock>
          )}

          <SectionBlock title="Что произойдёт после заявки">
            <ol style={{ margin: "8px 0 0", paddingLeft: "1.2rem", color: "var(--mw-muted)", lineHeight: 1.65 }}>
              {DEFAULT_AFTER_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {afterBooking && (
              <div style={{ marginTop: 16 }}>
                <h3 className="mw-h3">Комментарий организатора</h3>
                <Prose text={afterBooking} />
              </div>
            )}
          </SectionBlock>

          {trustReason && (
            <SectionBlock title="Описание и факты в карточке">
              <Prose text={trustReason} />
            </SectionBlock>
          )}

          {program.cta && (
            <SectionBlock title="Следующий шаг">
              <Prose text={program.cta} />
            </SectionBlock>
          )}

          {displayMedia.length > 0 && (
            <SectionBlock title="Медиа">
              {displayMedia.map((m) => (
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

          <section id="request" className="mw-form-card">
            <h2 className="mw-h2">Записаться на кэмп</h2>
            <p className="mw-form-hint">Ты выбираешь — организатор подтверждает — вы едете вместе.</p>
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
                <label htmlFor="notes">Что важно для тебя в этом выезде</label>
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
              <div className="mw-field" style={{ marginBottom: 14, fontSize: "0.9rem", lineHeight: 1.5 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={consentTransfer}
                    onChange={(e) => setConsentTransfer(e.target.checked)}
                    disabled={submitting}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Соглашаюсь на передачу контакта организатору этой программы для ответа по заявке.
                  </span>
                </label>
              </div>
              <div className="mw-field" style={{ marginBottom: 16, fontSize: "0.9rem", lineHeight: 1.5 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={consentPrivacy}
                    onChange={(e) => setConsentPrivacy(e.target.checked)}
                    disabled={submitting}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Ознакомился с{" "}
                    <Link href="/privacy-and-consent" className="mw-link" prefetch={false}>
                      политикой и согласием
                    </Link>{" "}
                    (в т.ч. обработка данных в рамках заявки).
                  </span>
                </label>
              </div>
              <button
                type="submit"
                disabled={submitting || !guestContact.trim() || !consentTransfer || !consentPrivacy}
                className="mw-btn mw-btn--primary"
              >
                {submitting ? "Отправляем…" : "Забронировать место"}
              </button>
              <p className="mw-form-note" style={{ marginTop: 12 }}>
                Ответим в течение дня • без обязательств
              </p>
              <p className="mw-form-note" style={{ marginTop: 8 }}>
                Финальные условия подтвердит организатор.
              </p>
            </form>
          </section>
        </div>

        <aside className="mw-pdp-sticky" aria-label="Заявка на программу">
          <div className="mw-card mw-pdp-sticky-card">
            {program.priceFromRub != null && (
              <p style={{ margin: "0 0 6px", fontSize: "1.35rem", fontWeight: 700 }}>
                от {program.priceFromRub.toLocaleString("ru-RU")} {program.currency ?? "₽"}
              </p>
            )}
            <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.92rem" }}>Ближайшие даты: {datesLine}</p>
            <a href="#request" className="mw-btn mw-btn--primary" style={{ width: "100%", textAlign: "center" }}>
              Забронировать место
            </a>
            <p style={{ margin: "10px 0 0", fontSize: "0.82rem", color: "var(--mw-muted)", lineHeight: 1.45 }}>
              Ответ организатора после подтверждения наличия мест.
            </p>
          </div>
        </aside>
      </div>

      <div className="mw-pdp-mobile-cta" role="region" aria-label="Быстрая заявка">
        <div className="mw-pdp-mobile-cta__inner">
          <div>
            {program.priceFromRub != null && (
              <span style={{ fontWeight: 700 }}>от {program.priceFromRub.toLocaleString("ru-RU")} {program.currency ?? "₽"}</span>
            )}
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--mw-muted)" }}>{datesLine}</span>
          </div>
          <a href="#request" className="mw-btn mw-btn--primary">
            Забронировать
          </a>
        </div>
      </div>
    </main>
  );
}

function seasonOfProgramStart(program: Program): "winter" | "spring" | "summer" | "autumn" {
  const m = new Date(program.startDate).getMonth() + 1;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

/** Строка для `exploreNavLinkFromRaw("season", …)` — та же логика, что и «сезон старта» в UI. */
function seasonRawForProgramHub(p: Program): string {
  const s = seasonOfProgramStart(p);
  if (s === "winter") return "зима";
  if (s === "spring") return "весна";
  if (s === "summer") return "лето";
  return "осень";
}
