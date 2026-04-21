import Link from "next/link";
import {
  firstProgramCoverImageUrl,
  programCardCoverFit,
  programCardCoverPlaceholderClass,
  type ProgramMediaItem,
} from "../lib/programCardCover";
import { getDisciplineDisplay } from "../lib/disciplineLabels";

export type ProgramCardProgram = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  priceFromRub: number | null;
  levelRequired?: string | null;
  organizer?: {
    displayName: string;
    verificationStatus?: string;
    reviewCount?: number;
    ratingAvg?: number | null;
    verificationBadge?: string | null;
  };
  media?: ProgramMediaItem[];
};

type Props = {
  program: ProgramCardProgram;
  levelLabel: string;
  catalogHrefBuilder?: (next: { discipline?: string; country?: string; region?: string }) => string;
};

function reviewWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

function organizerVerificationLabel(status: string | null | undefined): string {
  switch (status) {
    case "trusted_by_platform":
      return "Проверка платформы: trusted";
    case "verified":
      return "Проверка платформы: verified";
    case "checked":
      return "Проверка платформы: checked";
    case "listed":
      return "Проверка платформы: базовый листинг";
    case "paused":
      return "Проверка платформы: приостановлена";
    case "rejected":
      return "Проверка платформы: отклонено";
    default:
      return "Проверка платформы: нет данных";
  }
}

function sanitizeLocation(value: string | null | undefined): string | null {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const parts = normalized
    .split(/[·•|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return parts[parts.length - 1] ?? normalized;
  }
  return normalized;
}

function resolveLocation(program: ProgramCardProgram): { primary: string; secondary: string | null } {
  const exact = sanitizeLocation(program.exactLocation);
  const region = sanitizeLocation(program.region);

  if (exact && region && exact.toLowerCase() !== region.toLowerCase()) {
    return { primary: exact, secondary: region };
  }
  if (exact) {
    return { primary: exact, secondary: null };
  }
  if (region) {
    return { primary: region, secondary: null };
  }
  return { primary: "Уточняется", secondary: null };
}

export function ProgramCard({ program, levelLabel, catalogHrefBuilder }: Props) {
  const dates = `${new Date(program.startDate).toLocaleDateString("ru-RU")} – ${new Date(program.endDate).toLocaleDateString("ru-RU")}`;
  const coverUrl = firstProgramCoverImageUrl(program.media);
  const coverFit = programCardCoverFit(coverUrl, program.title, program.organizer?.displayName);
  const placeholderMod = programCardCoverPlaceholderClass(program.title, program.id);
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
      ? `Новый на платформе · ${reviewCount} ${reviewWord(reviewCount)}`
      : "Новый на платформе";
  const averageRatingLabel = hasStableRating ? `Средний рейтинг: ${program.organizer?.ratingAvg?.toFixed(1)}` : "Средний рейтинг: —";
  const verificationLabel =
    program.organizer?.verificationBadge ??
    organizerVerificationLabel(program.organizer?.verificationStatus);

  return (
    <article className="mw-program-card">
      <Link
        href={`/program/${program.id}`}
        className="mw-program-card__cover-link"
        aria-label={`Открыть программу: ${program.title}`}
      >
        <div className="mw-program-card__cover">
          {coverUrl ? (
            <div className={`mw-program-card__cover-frame mw-program-card__cover-frame--${coverFit}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL из API, домены не фиксированы */}
              <img src={coverUrl} alt="" className={`mw-program-card__cover-img mw-program-card__cover-img--${coverFit}`} />
            </div>
          ) : (
            <div className={`mw-program-card__cover-placeholder ${placeholderMod}`} aria-hidden>
              <span className="mw-program-card__cover-label">{discipline.original}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="mw-program-card__body">
        <h3 className="mw-program-card__title">
          <Link href={`/program/${program.id}`}>{program.title}</Link>
        </h3>
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
            {discipline.translation && <span className="mw-program-card__fact-note">{discipline.translation}</span>}
          </div>
          <div className="mw-program-card__fact">
            <span className="mw-program-card__fact-label">Место</span>
            {regionCatalogHref ? (
              <Link className="mw-program-card__fact-value" href={regionCatalogHref} title="Показать программы в этом регионе / локации">
                {location.primary}
              </Link>
            ) : (
              <span className="mw-program-card__fact-value">{location.primary}</span>
            )}
            {location.secondary && <span className="mw-program-card__fact-note">{location.secondary}</span>}
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
          <span className="mw-program-card__secondary-item">{averageRatingLabel}</span>
          <span className="mw-program-card__secondary-item">{verificationLabel}</span>
        </div>

        <Link href={`/program/${program.id}`} className="mw-btn mw-btn--primary" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
          Открыть программу
        </Link>
      </div>
    </article>
  );
}
