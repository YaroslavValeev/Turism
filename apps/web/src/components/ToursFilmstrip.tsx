"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SequencePager } from "./SequencePager";
import { applyProgramCardImageFallback, normalizeProgramCardCoverSrc } from "../lib/programCardCover";
import { availableTours, tourDiscipline, tourFilterChips, type TourDateWindow } from "../lib/tourFilters";
import {
  type ProgramLike,
  type TourCardModel,
  programToTourCard,
} from "./toursFilmstripModel";

const DATE_FILTER_OPTIONS: { value: TourDateWindow; label: string }[] = [
  { value: "", label: "Все даты" },
  { value: "30", label: "30 дней" },
  { value: "60", label: "60 дней" },
  { value: "90", label: "90 дней" },
];

type Props = {
  programs: ProgramLike[];
  /** Регионы и локации для селекта «Регион» */
  regionOptions: string[];
  loading?: boolean;
  /** Ссылка «Смотреть все туры» */
  allToursHref?: string;
};

function ChipIcon({ id }: { id: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24" as const, "aria-hidden": true as const };
  switch (id) {
    case "all":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 20 6-12 4 6 3-4 5 10Z" />
        </svg>
      );
  }
}

function IconRow({ k }: { k: "cal" | "sun" | "bar" }) {
  if (k === "cal")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  if (k === "sun")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="4" y="14" width="4" height="6" rx="1" />
      <rect x="10" y="9" width="4" height="11" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function TourCard({
  item,
  loading,
  idx,
  priority,
}: {
  item: TourCardModel | null;
  loading: boolean;
  idx: number;
  priority: boolean;
}) {
  if (loading || !item) {
    return (
      <div className="tour-card tour-card--skeleton" aria-hidden>
        <div className="tour-card-image" />
        <div className="tour-card-body">
          <div className="tour-card-skeleton-line" style={{ width: "80%" }} />
          <div className="tour-card-skeleton-line" style={{ width: "50%" }} />
        </div>
      </div>
    );
  }

  return (
    <article
      className={`tour-card ${item.isArchived ? "tour-card--archived" : ""}`}
      style={{ ["--i" as string]: String(idx) }}
    >
      <div className="tour-card-image">
        {/* eslint-disable-next-line @next/next/no-img-element -- источники динамические, нужен единый onError fallback */}
        <img
          src={normalizeProgramCardCoverSrc(item.imageSrc)}
          alt=""
          className="tour-card-image__img"
          loading={priority ? "eager" : "lazy"}
          onError={(event) => applyProgramCardImageFallback(event.currentTarget)}
        />
        {item.badge && (
          <span className="tour-card-badge" style={{ background: item.badge.bg, color: item.badge.color }}>
            {item.badge.label}
          </span>
        )}
        <button
          type="button"
          className="tour-card-fav"
          aria-label="В избранное"
          onClick={(e) => e.preventDefault()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21.4l8.8-9a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
      </div>
      <div className="tour-card-body">
        <h3 className="tour-card-title">
          <Link href={item.href} className="tour-card-title__link">
            {item.title}
          </Link>
        </h3>
        <p className="tour-card-loc">
          <svg className="tour-card-loc__ico" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="2" />
          </svg>
          {item.location}
        </p>
        <ul className="tour-card-meta" aria-label="Сроки и уровень">
          <li>
            <span className="tour-card-meta__ico" aria-hidden>
              <IconRow k="cal" />
            </span>
            {item.dateLine}
          </li>
          <li>
            <span className="tour-card-meta__ico" aria-hidden>
              <IconRow k="sun" />
            </span>
            {item.durationLine}
          </li>
          <li>
            <span className="tour-card-meta__ico" aria-hidden>
              <IconRow k="bar" />
            </span>
            {item.levelLine}
          </li>
        </ul>
        <div className="tour-card-footer">
          <span className="tour-card-price mw-price-fx">
            <span className="mw-price-fx__main">{item.priceLabel}</span>
            {item.priceRubLabel ? (
              <span className="mw-price-fx__rub" title={item.priceRubTitle}>
                {item.priceRubLabel}
              </span>
            ) : null}
          </span>
          <Link href={item.href} className="tour-card-button">
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  );
}

const PAGE = 4;

export function ToursFilmstrip({ programs, regionOptions, loading, allToursHref = "/#programs" }: Props) {
  const [chip, setChip] = useState("all");
  const [dateWin, setDateWin] = useState<TourDateWindow>("");
  const [region, setRegion] = useState<string>("");
  const [page, setPage] = useState(0);

  const available = useMemo(
    () => loading ? [] : availableTours(programs, { dateWindow: dateWin, region }),
    [programs, dateWin, region, loading],
  );
  const chips = useMemo(() => tourFilterChips(available), [available]);
  const activeChip = chips.some((item) => item.id === chip) ? chip : "all";

  useEffect(() => {
    if (chip !== activeChip) {
      setChip("all");
      setPage(0);
    }
  }, [chip, activeChip]);

  const cards: TourCardModel[] = useMemo(
    () => available
      .filter((program) => activeChip === "all" || tourDiscipline(program.discipline)?.id === activeChip)
      .map((program, index) => programToTourCard(program, index)),
    [available, activeChip],
  );

  const pageCount = loading || cards.length === 0 ? 1 : Math.max(1, Math.ceil(cards.length / PAGE));

  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount, chip, dateWin, region]);

  const currentSlice = useMemo(() => cards.slice(page * PAGE, page * PAGE + PAGE), [cards, page]);

  const canPrev = page > 0;
  const canNext = page < pageCount - 1;

  const goPrev = useCallback(() => {
    if (canPrev) setPage((p) => p - 1);
  }, [canPrev]);

  const goNext = useCallback(() => {
    if (canNext) setPage((p) => p + 1);
  }, [canNext]);

  return (
    <div className="tours-filmstrip-section" aria-label="Туры и кемпы — кинолента">
      <div className="tours-filmstrip-head">
        <p className="tours-filmstrip-eyebrow">Подберите тур под себя</p>
        <h2 className="tours-filmstrip-title">Туры и кемпы</h2>
        <p className="tours-filmstrip-desc">
          Выбирай дисциплину, даты и регион — смотри доступные программы.
        </p>
      </div>

      <div className="tours-filters-bar" role="search" aria-label="Фильтр туров">
        <div className="tours-filters-chips" role="group" aria-label="Дисциплины доступных туров">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`tour-filter-chip ${activeChip === c.id ? "tour-filter-chip--active" : ""}`}
              onClick={() => {
                setChip(c.id);
                setPage(0);
              }}
              aria-pressed={activeChip === c.id}
              disabled={loading}
            >
              <span className="tour-filter-chip__ic">
                <ChipIcon id={c.id} />
              </span>
              {c.label}
              {!loading && <span className="tour-filter-chip__count">{c.count}</span>}
            </button>
          ))}
        </div>
        <div className="tours-filters-ext">
          <label className="tour-filter-wrap">
            <span className="tour-filter-wrap__ic" aria-hidden>
              <IconRow k="cal" />
            </span>
            <select
              className="tour-filter-select"
              value={dateWin}
              onChange={(e) => {
                setDateWin(e.target.value as TourDateWindow);
                setPage(0);
              }}
              aria-label="Даты"
            >
              {DATE_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "any"} value={o.value}>
                  {o.value ? `Старт: ${o.label}` : "Дата: все"}
                </option>
              ))}
            </select>
          </label>
          <label className="tour-filter-wrap">
            <span className="tour-filter-wrap__ic" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
            </span>
            <select
              className="tour-filter-select"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setPage(0);
              }}
              aria-label="Регион"
            >
              <option value="">Все регионы</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="tours-filmstrip-outer">
        <div className="tours-filmstrip">
          {!loading && cards.length === 0 && (
            <p className="tours-filmstrip-note" role="status">
              Пока нет актуальных туров по выбранным условиям. Измени даты или регион либо открой все программы.
            </p>
          )}
          {loading ? (
            <div className="tours-filmstrip-track tours-filmstrip-track--skeleton" aria-hidden>
              {[0, 1, 2, 3].map((j) => (
                <TourCard key={j} item={null} loading idx={j} priority={j < 2} />
              ))}
            </div>
          ) : (
            <div className="tours-filmstrip-track">
              {currentSlice.map((item, i) => (
                <TourCard
                  key={`${item.id}-p${page}`}
                  item={item}
                  loading={false}
                  idx={i}
                  priority={page === 0 && i < 2}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tours-filmstrip-bottom">
        <SequencePager index={page} count={pageCount} label="Страницы туров и кемпов" previousLabel="Предыдущие туры" nextLabel="Следующие туры" onPrevious={goPrev} onNext={goNext} />
        <div className="tours-filmstrip-bottom__link">
          <Link href={allToursHref} className="tours-filmstrip-all">
            Смотреть все туры →
          </Link>
        </div>
      </div>
    </div>
  );
}
