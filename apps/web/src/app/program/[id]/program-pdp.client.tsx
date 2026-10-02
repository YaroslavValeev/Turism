"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { exploreNavLinkFromRaw } from "@mywave/explore-links";
import { getProgramLevelLabel, getSeverityLabel } from "@mywave/shared-types";
import {
  getProgramFieldOverrides,
  mergeProgramField,
} from "../../../content/programPageOverrides";
import { getDisciplineDisplay } from "../../../lib/disciplineLabels";
import { buildInternalContentQuery } from "../../../lib/internalContentUtm";
import { validExploreMainLinks } from "../../../lib/exploreNavWeb";
import { orderProgramMediaForDisplay } from "../../../lib/programCardCover";
import {
  extractLabeledFieldValue,
  organizerText,
  readMyWaveNotes,
  resolveProgramField,
} from "../../../lib/recommendedProgramFields";
import { trackProductEvent } from "../../../lib/analytics/client";

import { getPublicApiBase } from "../../../lib/publicApiBase";
import { contactError, bookingFeedback } from "../../../lib/bookingFeedback";
import {
  isFestival,
  localDate,
  participantLevel,
  programFormatLabel,
  safeCatalogReturn,
} from "../../../lib/catalog";
import { isOnRequestProgram, onRequestLabel } from "../../../lib/programSchedule";
import {
  displayValue,
  durationDaysLabel,
  formatDateRangeRu,
  humanLabel,
  summarizeLines,
} from "../../../lib/programDisplay";
import { ProgramHero, type ProgramStatusChip } from "../../../components/program-pdp/ProgramHero";
import { ProgramGallery, ProgramHeroMedia, isVideoMedia } from "../../../components/program-pdp/ProgramMedia";
import { ProgramDecisionPanel } from "../../../components/program-pdp/ProgramDecisionPanel";
import { ProgramQuickFacts, type QuickFact } from "../../../components/program-pdp/ProgramQuickFacts";
import { ProgramSection } from "../../../components/program-pdp/ProgramSection";
import {
  BulletList,
  MyWaveNote,
  Prose,
  SourceCaption,
  linesToBullets,
} from "../../../components/program-pdp/ProgramText";
import { ProgramLogisticsField } from "../../../components/program-pdp/ProgramEnrichmentField";
import type { ProgramEnrichment } from "../../../lib/programEnrichment";
import { ProgramReviews } from "../../../components/program-pdp/ProgramReviews";
import { ProgramProvenance } from "../../../components/program-pdp/ProgramProvenance";
import { ProgramApplicationForm } from "../../../components/program-pdp/ProgramApplicationForm";
import { ProgramRelated } from "../../../components/program-pdp/ProgramRelated";
import { ProgramMobileCta } from "../../../components/program-pdp/ProgramMobileCta";
import {
  IconCalendar,
  IconCompass,
  IconLevel,
  IconShield,
  IconSun,
  IconWave,
} from "../../../components/program-pdp/icons";

export type Program = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  scheduleType?: string | null;
  seasonLabel?: string | null;
  formatType: string | null;
  levelRequired: string | null;
  riskLevel: string | null;
  priceFromRub: number | null;
  currency: string | null;
  priceRubApprox?: number | null;
  priceRubRateDate?: string | null;
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
  media: {
    id: string;
    url: string;
    caption: string | null;
    mediaType: string;
  }[];
  mediaOrderPinned?: boolean;
  aiEnrichment?: unknown;
  enrichment?: ProgramEnrichment;
};

function sourceTypeLabelRuPdp(t: string | null | undefined): string {
  const k = String(t ?? "").toLowerCase();
  if (k === "instagram") return "Instagram";
  if (k === "telegram") return "Telegram";
  if (k === "rss") return "RSS";
  if (k === "site" || k === "website") return "сайт-источник";
  return displayValue(t) ?? "источник";
}

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

function buildCatalogHref(next: {
  discipline?: string;
  region?: string;
}): string {
  const params = new URLSearchParams();
  if (next.discipline?.trim()) params.set("discipline", next.discipline.trim());
  if (next.region?.trim()) params.set("region", next.region.trim());
  const qs = params.toString();
  return qs ? `/?${qs}#programs` : "/#programs";
}

function organizerVerificationLabelRu(
  status: string | null | undefined,
): string {
  switch (status) {
    case "trusted_by_platform":
      return "Профиль: данные проверены платформой";
    case "verified":
      return "Профиль: данные проверены платформой";
    case "checked":
      return "Профиль: данные проходят проверку";
    case "listed":
      return "Профиль: базовая публикация в каталоге";
    case "paused":
      return "Профиль: публикация приостановлена";
    case "rejected":
      return "Профиль: заявка отклонена";
    default:
      return "Статус проверки уточняется";
  }
}

const DEFAULT_AFTER_STEPS = [
  "Вы отправляете заявку через форму на сайте.",
  "Команда MyWaveTour при необходимости уточняет детали и передаёт заявку организатору.",
  "Организатор подтверждает наличие мест и условия, связывается с вами.",
  "Дальше вы согласуете участие и оплату напрямую с организатором по его правилам.",
];

type PdpProps = {
  id: string;
  validHubKeys: Set<string>;
  initialProgram: Program;
  initialReviews: PublicReview[];
};

export function ProgramPdpClient({
  id,
  validHubKeys,
  initialProgram,
  initialReviews,
}: PdpProps) {
  const [program, setProgram] = useState<Program | null>(initialProgram);
  const [reviews, setReviews] = useState<PublicReview[]>(initialReviews);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [consentTransfer, setConsentTransfer] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [returnTo, setReturnTo] = useState("/#programs");
  useEffect(() => {
    if (submitError || submitSuccess)
      document.getElementById("program-request-feedback")?.focus();
  }, [submitError, submitSuccess]);
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
    setReturnTo(safeCatalogReturn(q.get("returnTo")));
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
    if (initialProgram.id === id) {
      void trackProductEvent("page_view", {
        page_type: "program_detail",
        program_id: initialProgram.id,
        organizer_id: initialProgram.organizer?.id,
        discipline: initialProgram.discipline,
        region: initialProgram.region,
        traffic_source: "program_page",
      });
      void trackProductEvent("view_item", {
        page_type: "program_detail",
        program_id: initialProgram.id,
        organizer_id: initialProgram.organizer?.id,
        discipline: initialProgram.discipline,
        region: initialProgram.region,
        traffic_source: "program_page",
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadError("");
        const [progRes, revRes] = await Promise.all([
          fetch(`${getPublicApiBase()}/programs/${id}`),
          fetch(
            `${getPublicApiBase()}/reviews/public?programId=${encodeURIComponent(id)}`,
          ),
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
          setLoadError(
            "Сервис программ временно недоступен. Обновите страницу через несколько секунд.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, initialProgram]);

  const overrides = useMemo(
    () => (program ? getProgramFieldOverrides(program.title) : {}),
    [program],
  );

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
      { mediaOrderPinned: program.mediaOrderPinned },
    );
  }, [program]);

  if (loading) {
    return (
      <main className="mw-pdp-root">
        <div className="mw-container mw-pdp-state" aria-busy="true">
          <p role="status">Загрузка…</p>
        </div>
      </main>
    );
  }
  if (!program) {
    return (
      <main className="mw-pdp-root">
        <div className="mw-container mw-pdp-state">
          <p role={loadError ? "alert" : undefined}>
            {loadError || "Программа не найдена."}
          </p>
          <Link href={returnTo} className="mw-page-back">
            ← К результатам поиска
          </Link>
        </div>
      </main>
    );
  }

  const audienceFit = mergeProgramField(
    organizerText(program.audienceFit),
    overrides.audienceFit,
  );
  const itinerary = mergeProgramField(
    organizerText(program.itineraryDayByDay),
    overrides.itineraryDayByDay,
  );
  const trustReason = mergeProgramField(
    program.trustReason,
    overrides.trustReason,
  );
  const afterBooking = mergeProgramField(
    program.whatHappensAfterBooking,
    overrides.whatHappensAfterBooking,
  );
  const gear = mergeProgramField(
    organizerText(program.gearRequirements),
    overrides.gearRequirements,
  );
  const myWaveNotes = readMyWaveNotes(program.aiEnrichment);
  const inclusions = organizerText(program.inclusions);
  const exclusions = organizerText(program.exclusions);
  const cancellationRules = organizerText(program.cancellationRules);
  const sourcePostUrl = /^https?:\/\//i.test(program.sourceUrl ?? "") ? program.sourceUrl ?? null : null;
  const medical = mergeProgramField(
    program.medicalLimitations,
    overrides.medicalLimitations,
  );
  const sourceTextScope = [
    inclusions,
    exclusions,
    itinerary,
    audienceFit,
    trustReason,
  ];
  const isKidsProgram =
    !isFestival(program) &&
    /детский|детская|детские|kids|подростковый/i.test(
      `${program.title} ${program.formatType ?? ""}`,
    );
  const ended = program.endDate.slice(0, 10) < localDate();
  const isHighRiskProgram =
    /high|critical|extreme|высок/i.test(String(program.riskLevel ?? "")) ||
    /freeride|mountain|альп|фрирайд|горы/i.test(
      `${program.discipline ?? ""} ${program.formatType ?? ""}`,
    );
  const equipmentField = resolveProgramField({
    field: "equipment",
    organizerValue: gear,
    myWaveNote: myWaveNotes?.gear,
    discipline: program.discipline,
    programFormat: program.formatType,
    isKids: isKidsProgram,
    isHighRisk: isHighRiskProgram,
  });
  const accommodationField = resolveProgramField({
    field: "accommodation",
    organizerValue:
      extractLabeledFieldValue("accommodation", sourceTextScope) ??
      program.accommodationDetails ??
      null,
    myWaveNote: myWaveNotes?.accommodation,
    discipline: program.discipline,
    programFormat: program.formatType,
    isKids: isKidsProgram,
    isHighRisk: isHighRiskProgram,
  });
  const transferField = resolveProgramField({
    field: "transfer",
    organizerValue:
      extractLabeledFieldValue("transfer", sourceTextScope) ??
      program.transferDetails ??
      null,
    myWaveNote: myWaveNotes?.transfer,
    discipline: program.discipline,
    programFormat: program.formatType,
    isKids: isKidsProgram,
    isHighRisk: isHighRiskProgram,
  });
  const discipline = getDisciplineDisplay(program.discipline);
  const disciplineCatalogHref = buildCatalogHref({
    discipline: discipline.original,
  });
  const regionCatalogHref = buildCatalogHref({
    region: program.exactLocation?.trim()
      ? `${program.region} · ${program.exactLocation}`
      : program.region,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const invalidContact = contactError(guestContact);
    if (invalidContact || ended) {
      setSubmitSuccess("");
      setSubmitError(
        ended
          ? "Этот выезд уже завершился. Выберите актуальные даты в каталоге."
          : invalidContact!,
      );
      document.getElementById("guestContact")?.focus();
      return;
    }
    if (!consentTransfer || !consentPrivacy) {
      setSubmitError(
        "Нужно согласие на передачу контакта организатору и с политикой конфиденциальности.",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const res = await fetch(`${getPublicApiBase()}/bookings`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
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
      const body = await res.json().catch(() => null);
      const feedback = bookingFeedback(res.status, body);
      if (feedback.error) throw new Error(feedback.error);
      setSubmitSuccess(feedback.success!);
      if (res.status === 201)
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
    } catch (error) {
      setSubmitError(
        error instanceof TypeError ||
          (error instanceof Error &&
            ["TimeoutError", "AbortError"].includes(error.name))
          ? "Связь прервалась. Данные остались в форме. Повторите попытку позже."
          : error instanceof Error
            ? error.message
            : "Не удалось отправить заявку",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onRequest = isOnRequestProgram(program);
  const datesLabel = onRequest
    ? onRequestLabel(program)
    : formatDateRangeRu(program.startDate, program.endDate);
  const datesShortLabel = onRequest
    ? onRequestLabel(program)
    : formatDateRangeRu(program.startDate, program.endDate, { short: true });
  const seasonRu =
    seasonOfProgramStart(program) === "winter"
      ? "Зима"
      : seasonOfProgramStart(program) === "spring"
        ? "Весна"
        : seasonOfProgramStart(program) === "summer"
          ? "Лето"
          : "Осень";

  const inclusionLines = inclusions ? linesToBullets(inclusions) : [];
  const exclusionLines = exclusions ? linesToBullets(exclusions) : [];

  const programEntryQuery = buildInternalContentQuery("program", program.id);
  const exploreHubLinks = validExploreMainLinks(
    [
      exploreNavLinkFromRaw("discipline", program.discipline),
      exploreNavLinkFromRaw("region", program.region),
      exploreNavLinkFromRaw("season", seasonRawForProgramHub(program)),
    ],
    validHubKeys,
  );

  const disciplineLabel = displayValue(program.discipline)
    ? discipline.translation || discipline.original
    : null;
  const regionLabel = displayValue(program.region);
  const exactLocationLabel = displayValue(program.exactLocation);
  const formatLabel = displayValue(program.formatType)
    ? displayValue(programFormatLabel(program.formatType))
    : null;
  const shownFormatLabel = formatLabel === "Формат уточняется" ? null : formatLabel;
  const durationLabel = durationDaysLabel(program.durationDays);
  const levelLabel = displayValue(
    participantLevel(program, humanLabel(program.levelRequired, getProgramLevelLabel) ?? "Требования уточняются"),
  );
  const riskLabel = humanLabel(program.riskLevel, getSeverityLabel);
  const riskSourceKind = program.autoPublished ? "mywave" : "organizer";
  const organizerLabel =
    displayValue(program.organizerName) ?? displayValue(program.organizer?.displayName);
  const showVerification = !program.autoPublished && Boolean(program.organizer?.verificationStatus);

  const statusChip: ProgramStatusChip | null = ended
    ? { label: "Завершён", tone: "neutral" }
    : null;

  const quickFactCandidates: (QuickFact | null)[] = [
    durationLabel
      ? { key: "duration", icon: <IconCalendar />, label: "длительность", value: durationLabel }
      : null,
    disciplineLabel
      ? {
          key: "discipline",
          icon: <IconWave />,
          label: "дисциплина",
          value: disciplineLabel,
          href: disciplineCatalogHref,
        }
      : null,
    levelLabel ? { key: "level", icon: <IconLevel />, label: "уровень", value: levelLabel } : null,
    shownFormatLabel
      ? { key: "format", icon: <IconCompass />, label: "тип программы", value: shownFormatLabel }
      : null,
    { key: "season", icon: <IconSun />, label: "сезон старта", value: seasonRu },
    riskLabel
      ? {
          key: "risk",
          icon: <IconShield />,
          label: "риск / интенсивность",
          value: riskLabel,
          note: riskSourceKind === "mywave" ? "Оценка MyWaveTour" : undefined,
        }
      : null,
  ];
  const quickFacts = quickFactCandidates.filter((fact): fact is QuickFact => fact !== null);

  const heroImage = displayMedia.find((m) => !isVideoMedia(m)) ?? null;
  const galleryItems = displayMedia.filter((m) => m !== heroImage);
  const imageCount = displayMedia.filter((m) => !isVideoMedia(m)).length;
  const priceFields = {
    priceFromRub: program.priceFromRub,
    currency: program.currency,
    priceRubApprox: program.priceRubApprox,
    priceRubRateDate: program.priceRubRateDate,
  };

  return (
    <main className="mw-pdp-root">
      <div className="mw-container mw-pdp-layout">
        <div className="mw-pdp-head">
          <ProgramHero
            returnTo={returnTo}
            title={program.title}
            metaParts={[shownFormatLabel, durationLabel].filter((p): p is string => Boolean(p))}
            status={statusChip}
            region={regionLabel ? { label: regionLabel, href: regionCatalogHref } : null}
            exactLocation={
              exactLocationLabel && exactLocationLabel.toLowerCase() !== regionLabel?.toLowerCase()
                ? exactLocationLabel
                : null
            }
          />
          {heroImage && (
            <ProgramHeroMedia
              item={heroImage}
              title={program.title}
              imageCount={imageCount}
              galleryAnchor={galleryItems.length > 0 ? "media" : null}
            />
          )}
        </div>

        <div className="mw-pdp-facts-area">
          <ProgramQuickFacts facts={quickFacts} />
        </div>

        <aside className="mw-pdp-aside" aria-label="Заявка на программу">
          <ProgramDecisionPanel
            price={priceFields}
            datesLabel={datesLabel}
            durationLabel={durationLabel}
            included={inclusionLines.length > 0 ? summarizeLines(inclusionLines, 3) : null}
            rating={
              reviewStats.count > 0 && reviewStats.avg != null
                ? { avg: reviewStats.avg, count: reviewStats.count }
                : null
            }
            ended={ended}
          />
        </aside>

        <div className="mw-pdp-body">
          {(audienceFit || myWaveNotes?.audience) && (
            <ProgramSection id="audience" title="Для кого программа">
              {audienceFit ? (
                <>
                  <SourceCaption kind="organizer" />
                  <Prose text={audienceFit} />
                </>
              ) : (
                <MyWaveNote>{myWaveNotes?.audience}</MyWaveNote>
              )}
            </ProgramSection>
          )}

          {itinerary && !program.autoPublished && (
            <ProgramSection id="itinerary" title="Программа выезда">
              <details className="mw-source-description">
                <summary>Читать полное описание</summary>
                <Prose text={itinerary} />
              </details>
            </ProgramSection>
          )}

          {galleryItems.length > 0 && (
            <ProgramSection id="media" title="Фото и видео">
              <ProgramGallery items={galleryItems} title={program.title} />
            </ProgramSection>
          )}

          {(inclusions || exclusions) && (
            <ProgramSection id="inclusions" title="Включено и не включено">
              <SourceCaption kind="organizer" />
              <div className="mw-pdp-two-col">
                <div>
                  <h3 className="mw-pdp-h3">Включено</h3>
                  {inclusionLines.length > 0 ? (
                    <BulletList items={inclusionLines} />
                  ) : inclusions ? (
                    <Prose text={inclusions} />
                  ) : (
                    <p className="mw-pdp-empty">Организатор не указал отдельным списком.</p>
                  )}
                </div>
                <div>
                  <h3 className="mw-pdp-h3">Не включено</h3>
                  {exclusionLines.length > 0 ? (
                    <BulletList items={exclusionLines} />
                  ) : exclusions ? (
                    <Prose text={exclusions} />
                  ) : (
                    <p className="mw-pdp-empty">Организатор не указал отдельным списком.</p>
                  )}
                </div>
              </div>
            </ProgramSection>
          )}

          <ProgramSection id="logistics" title="Проживание, трансфер и экипировка">
            <div className="mw-pdp-two-col">
              <ProgramLogisticsField label="Тип размещения" value={accommodationField} enrichment={program.enrichment?.accommodation} />
              <ProgramLogisticsField label="Трансфер" value={transferField} enrichment={program.enrichment?.transfer} />
            </div>
            <div className="mw-pdp-subsection">
              <ProgramLogisticsField label="Экипировка" value={equipmentField} enrichment={program.enrichment?.equipment} />
            </div>
          </ProgramSection>

          {(riskLabel || medical) && (
            <ProgramSection id="risk" title="Риск, требования и ограничения">
              {riskLabel && (
                <div className="mw-pdp-risk">
                  <SourceCaption kind={riskSourceKind} />
                  <p className="mw-pdp-risk__value">
                    <strong>Оценка риска / интенсивности:</strong> {riskLabel}
                  </p>
                </div>
              )}
              {medical && (
                <div className="mw-pdp-subsection">
                  <h3 className="mw-pdp-h3">Медицинские и прочие ограничения</h3>
                  <Prose text={medical} />
                </div>
              )}
            </ProgramSection>
          )}

          {myWaveNotes && (
            <ProgramSection id="notes" title="Полезно знать">
              {myWaveNotes.general.map((note) => (
                <MyWaveNote key={note}>{note}</MyWaveNote>
              ))}
              <ul className="mw-mywave-links">
                {sourcePostUrl && (
                  <li>
                    <a href={sourcePostUrl} target="_blank" rel="nofollow noopener noreferrer">
                      Исходный пост организатора — проверьте детали в оригинале
                    </a>
                  </li>
                )}
                {disciplineLabel && (
                  <li>
                    <Link href={disciplineCatalogHref}>Другие программы по этой дисциплине в каталоге MyWave</Link>
                  </li>
                )}
                <li>
                  <Link href="/spots">Карта спотов MyWave с оценками условий</Link>
                </li>
              </ul>
            </ProgramSection>
          )}

          {(organizerLabel || showVerification) && (
            <ProgramSection
              id="organizer"
              title={program.autoPublished ? "Источник сведений" : "Об организаторе"}
            >
              {organizerLabel && <p className="mw-pdp-organizer__name">{organizerLabel}</p>}
              {showVerification && (
                <p className="mw-pdp-organizer__status">
                  {organizerVerificationLabelRu(program.organizer?.verificationStatus)}
                </p>
              )}
              {disciplineLabel && (
                <p className="mw-pdp-organizer__more">
                  <Link href={disciplineCatalogHref}>Все программы с этой дисциплиной в каталоге</Link>
                </p>
              )}
            </ProgramSection>
          )}

          <ProgramReviews reviews={reviews} stats={reviewStats} />

          {(cancellationRules || myWaveNotes?.cancellation) && (
            <ProgramSection id="cancellation" title="Условия участия и отмены">
              {cancellationRules ? (
                <Prose text={cancellationRules} />
              ) : (
                <MyWaveNote>{myWaveNotes?.cancellation}</MyWaveNote>
              )}
            </ProgramSection>
          )}

          <ProgramSection id="after-request" title="Что произойдёт после заявки">
            <ol className="mw-pdp-steps">
              {DEFAULT_AFTER_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {afterBooking && (
              <div className="mw-pdp-subsection">
                <h3 className="mw-pdp-h3">Дополнительные сведения</h3>
                <Prose text={afterBooking} />
              </div>
            )}
          </ProgramSection>

          <ProgramProvenance
            autoPublished={Boolean(program.autoPublished)}
            sourceTypeLabel={sourceTypeLabelRuPdp(program.sourceType)}
            reviewPending={program.reviewStatus === "auto_pending"}
            sourceUrl={sourcePostUrl}
            ingestedAt={program.ingestedAt}
            updatedFromSourceAt={program.updatedFromSourceAt}
            trustReason={trustReason ?? null}
            originalDescription={program.autoPublished ? itinerary ?? null : null}
          />

          <ProgramApplicationForm
            ended={ended}
            returnTo={returnTo}
            guestContact={guestContact}
            onGuestContactChange={setGuestContact}
            notes={notes}
            onNotesChange={setNotes}
            consentTransfer={consentTransfer}
            onConsentTransferChange={setConsentTransfer}
            consentPrivacy={consentPrivacy}
            onConsentPrivacyChange={setConsentPrivacy}
            submitting={submitting}
            submitError={submitError}
            submitSuccess={submitSuccess}
            onSubmit={handleSubmit}
          />

          <ProgramRelated links={exploreHubLinks} entryQuery={programEntryQuery} />
        </div>
      </div>

      <ProgramMobileCta price={priceFields} datesLabel={datesShortLabel} ended={ended} />
    </main>
  );
}

function seasonOfProgramStart(
  program: Program,
): "winter" | "spring" | "summer" | "autumn" {
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
