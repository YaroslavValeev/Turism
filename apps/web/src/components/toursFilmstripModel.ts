/**
 * Модель карточек для блока «Туры и кемпы» (кинолента).
 */

import { getProgramLevelLabel } from "@mywave/shared-types";
import { tourDiscipline } from "../lib/tourFilters";
import { pickBestProgramCoverImageUrl } from "../lib/programCardCover";
import { ruPluralNoun } from "../lib/ruPlural";
import { isOnRequestProgram, onRequestLabel } from "../lib/programSchedule";
import { formatProgramPrice, formatProgramPriceRub, formatProgramPriceRubTitle } from "../lib/priceFormat";

export type ProgramLike = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  scheduleType?: string | null;
  seasonLabel?: string | null;
  levelRequired: string | null;
  priceFromRub: number | null;
  currency?: string | null;
  priceRubApprox?: number | null;
  priceRubRateDate?: string | null;
  audienceFit: string | null;
  itineraryDayByDay?: string | null;
  media?: { id?: string; url: string; mediaType: string }[];
  mediaOrderPinned?: boolean;
};

function formatDateRangeRu(start: string, end: string): string {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  if (a.toDateString() === b.toDateString()) {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(a);
  }
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    const my = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(a);
    return `${a.getDate()}–${b.getDate()} ${my}`;
  }
  const aStr = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(a);
  const bStr = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(b);
  return `${aStr} – ${bStr}`;
}

function lineLevelLabel(p: ProgramLike): string {
  return `Уровень: ${getProgramLevelLabel(p.levelRequired)}`;
}

export type TourCardModel = {
  id: string;
  href: string;
  imageSrc: string;
  isRemote: boolean;
  isArchived?: boolean;
  title: string;
  location: string;
  dateLine: string;
  durationLine: string;
  levelLine: string;
  priceLabel: string;
  /** Тонкая строка «≈ … ₽ по курсу ЦБ» для цен в иностранной валюте. */
  priceRubLabel?: string | null;
  priceRubTitle?: string;
  badge: { label: string; bg: string; color: string } | null;
};

const FALLBACK_IMAGES = ["/pilot-media/program-1.svg", "/pilot-media/program-2.svg", "/pilot-media/program-3.svg"];

function coverUrl(p: ProgramLike, index: number): { url: string; isRemote: boolean } {
  const raw =
    pickBestProgramCoverImageUrl(p.media, `${p.title} ${p.audienceFit ?? ""} ${p.itineraryDayByDay ?? ""}`, {
      mediaOrderPinned: p.mediaOrderPinned,
    }) ??
    FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]!;
  /** Абсолютные URL и прокси `/api/media?...` не гоняем через `next/image`: оптимизатор даёт 400 на длинных query. */
  const isAbsoluteRemote = /^https?:\/\//i.test(raw);
  const isMediaProxy = raw.startsWith("/api/media");
  const isRemote = isAbsoluteRemote || isMediaProxy;
  return { url: raw, isRemote };
}

export function programToTourCard(
  p: ProgramLike,
  index: number,
  options?: { isArchived?: boolean },
): TourCardModel {
  const discipline = tourDiscipline(p.discipline);
  const badge = discipline ? { label: discipline.label, bg: "rgba(64, 69, 76, 0.13)", color: "#2f343a" } : null;
  const { url, isRemote } = coverUrl(p, index);
  const loc = p.exactLocation?.trim() ? `${p.region} · ${p.exactLocation}` : p.region;
  const nights = Math.max(0, p.durationDays - 1);
  const durationLine = `${p.durationDays} ${ruPluralNoun(p.durationDays, ["день", "дня", "дней"])} / ${nights} ${ruPluralNoun(
    nights,
    ["ночь", "ночи", "ночей"],
  )}`;

  return {
    id: p.id,
    href: `/program/${p.id}`,
    imageSrc: url,
    isRemote,
    isArchived: options?.isArchived === true,
    title: p.title,
    location: loc,
    dateLine: isOnRequestProgram(p) ? onRequestLabel(p) : formatDateRangeRu(p.startDate, p.endDate),
    durationLine,
    levelLine: lineLevelLabel(p),
    priceLabel: formatProgramPrice(p) ?? "Цена по запросу",
    priceRubLabel: formatProgramPriceRub(p),
    priceRubTitle: formatProgramPriceRubTitle(p),
    badge,
  };
}
