import Link from "next/link";
import { getDisciplineDisplay } from "../lib/disciplineLabels";
import {
  audienceShort,
  organizerVerificationLabelRu,
  resolveLocation,
  reviewWord,
  riskLabel,
  sourceTypeLabelRu,
} from "../lib/programCardHelpers";
import type { ProgramCardProgram } from "../lib/programCardModel";
import { HoverHint } from "./HoverHint";

type Props = {
  program: ProgramCardProgram;
  levelLabel: string;
  catalogHrefBuilder?: (next: { discipline?: string; region?: string }) => string;
  programHrefQuery?: string;
};

function buildPdp(program: ProgramCardProgram, programHrefQuery: string | undefined) {
  const pq = programHrefQuery && programHrefQuery.length > 0 ? `?${programHrefQuery.replace(/^\?/, "")}` : "";
  return `/program/${program.id}${pq}`;
}

export function ProgramCardBody({ program, levelLabel, catalogHrefBuilder, programHrefQuery }: Props) {
  const pdp = buildPdp(program, programHrefQuery);
  const dates = `${new Date(program.startDate).toLocaleDateString("ru-RU")} – ${new Date(program.endDate).toLocaleDateString("ru-RU")}`;
  const location = resolveLocation(program);
  const discipline = getDisciplineDisplay(program.discipline);
  const disciplineCatalogHref = catalogHrefBuilder?.({ discipline: discipline.original });
  const regionCatalogHref = catalogHrefBuilder?.({
    region: program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region,
  });
  const reviewCount = program.organizer?.reviewCount ?? 0;
  const hasStableRating = reviewCount >= 3 && typeof program.organizer?.ratingAvg === "number";
  const reviewSummaryLabel = hasStableRating
    ? `${program.organizer?.ratingAvg?.toFixed(1)} ★ (${reviewCount} ${reviewWord(reviewCount)})`
    : reviewCount > 0
      ? `Пока мало отзывов · ${reviewCount} ${reviewWord(reviewCount)}`
      : "Пока нет отзывов";
  const verificationLabel =
    program.organizer?.verificationBadge ?? organizerVerificationLabelRu(program.organizer?.verificationStatus);

  return (
    <>
      {program.autoPublished && (
        <p className="mw-program-card__provenance" style={{ margin: "0 0 8px", fontSize: "0.82rem", color: "var(--mw-muted2)" }}>
          <span className="mw-badge mw-badge--soon" style={{ marginRight: 8 }}>
            Автокаталог
          </span>
          {program.sourceType && <span>{sourceTypeLabelRu(program.sourceType)}</span>}
          {program.reviewStatus === "auto_pending" && <span style={{ marginLeft: 6 }}>· на проверке</span>}
        </p>
      )}
      <div className="mw-program-card__fact-grid">
        <div className="mw-program-card__fact">
          <span className="mw-program-card__fact-label">Дисциплина</span>
          {disciplineCatalogHref ? (
            <Link className="mw-program-card__fact-value" href={disciplineCatalogHref} title="Показать программы по этой дисциплине">
              {discipline.original}
            </Link>
          ) : (
            <span className="mw-program-card__fact-value">{discipline.original}</span>
          )}
          {discipline.translation && (
            <HoverHint hint={discipline.translation} className="mw-program-card__fact-hint">
              <span className="mw-program-card__fact-note">Разобрать программу</span>
            </HoverHint>
          )}
        </div>
        <div className="mw-program-card__fact">
          <span className="mw-program-card__fact-label">Регион</span>
          {regionCatalogHref ? (
            <Link className="mw-program-card__fact-value" href={regionCatalogHref} title="Показать программы в этом регионе">
              {location.primary}
            </Link>
          ) : (
            <span className="mw-program-card__fact-value">{location.primary}</span>
          )}
          {location.secondary && (
            <HoverHint hint={location.secondary} className="mw-program-card__fact-hint">
              <span className="mw-program-card__fact-note">Уточнение</span>
            </HoverHint>
          )}
        </div>
        <div className="mw-program-card__fact">
          <span className="mw-program-card__fact-label">Даты</span>
          <span className="mw-program-card__fact-value">{dates}</span>
        </div>
      </div>

      <div className="mw-program-card__secondary">
        {program.priceFromRub != null && (
          <span className="mw-program-card__secondary-item">от {program.priceFromRub.toLocaleString("ru-RU")} ₽</span>
        )}
        <span className="mw-program-card__secondary-item">{program.durationDays} дн.</span>
        {program.levelRequired && <span className="mw-program-card__secondary-item">Уровень: {levelLabel}</span>}
        {program.organizer && <span className="mw-program-card__secondary-item">{program.organizer.displayName}</span>}
        <span className="mw-program-card__secondary-item">{reviewSummaryLabel}</span>
        {program.organizer?.verificationStatus && <span className="mw-program-card__secondary-item">{verificationLabel}</span>}
      </div>

      <div className="mw-program-card__meta">
        <div className="mw-program-card__meta-row">
          <span className="mw-program-card__meta-label">Для кого</span>
          <span>{audienceShort(program.audienceFit)}</span>
        </div>
        <div className="mw-program-card__meta-row">
          <span className="mw-program-card__meta-label">Кто ведет</span>
          <span>{program.organizer?.displayName ?? "команда организатора"}</span>
        </div>
        <div className="mw-program-card__meta-row">
          <span className="mw-program-card__meta-label">Что даст</span>
          <span>прогресс в дисциплине и опыт в новой среде</span>
        </div>
        <div className="mw-program-card__meta-row">
          <span className="mw-program-card__meta-label">Риск</span>
          <span>{riskLabel(program.riskLevel)}</span>
        </div>
      </div>

      <Link href={pdp} className="mw-btn mw-btn--primary" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
        Разобрать программу
      </Link>
    </>
  );
}
