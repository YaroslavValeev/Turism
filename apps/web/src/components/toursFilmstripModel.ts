/**
 * Модель карточек для блока «Туры и кемпы» (кинолента).
 */

import { getProgramLevelLabel } from "@mywave/shared-types";
import { getDisciplineDisplay } from "../lib/disciplineLabels";
import { pickBestProgramCoverImageUrl } from "../lib/programCardCover";
import { ruPluralNoun } from "../lib/ruPlural";

export type ProgramLike = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  levelRequired: string | null;
  priceFromRub: number | null;
  audienceFit: string | null;
  itineraryDayByDay?: string | null;
  media?: { id?: string; url: string; mediaType: string }[];
};

export type TourCategoryKey = "all" | "wakesurf" | "family" | "kids" | "beginner";

export const TOUR_FILTER_CHIPS: { id: TourCategoryKey; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "wakesurf", label: "Вейксерф" },
  { id: "family", label: "Семейные" },
  { id: "kids", label: "Для детей" },
  { id: "beginner", label: "Новичкам" },
];

type BadgeKey = "wakesurf" | "family" | "kids" | "beginner";

const BADGE_META: Record<BadgeKey, { label: string; bg: string; color: string }> = {
  wakesurf: { label: "Вейксерф", bg: "rgba(0, 166, 166, 0.12)", color: "#008E8E" },
  family: { label: "Семейный", bg: "rgba(244, 114, 182, 0.18)", color: "#DB2777" },
  kids: { label: "Для детей", bg: "rgba(251, 191, 36, 0.2)", color: "#D97706" },
  beginner: { label: "Новичкам", bg: "rgba(168, 85, 247, 0.16)", color: "#7C3AED" },
};

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function discText(p: ProgramLike): string {
  const d = getDisciplineDisplay(p.discipline);
  return norm([d.original, d.translation].filter(Boolean).join(" "));
}

function blob(p: ProgramLike): string {
  return norm(
    [p.title, p.region, p.exactLocation, p.audienceFit, discText(p), p.itineraryDayByDay].join(" "),
  );
}

/** К какому «чипу» относится тур — для бейджа (приоритет: дети → семья → вейк → новичкам). */
export function programPrimaryBadge(p: ProgramLike): BadgeKey {
  const b = blob(p);
  if (/(^|\s|\/)(дет|детск|ребён|reben|подрост|школ|клуб\s+для)/i.test(b) || /для\s+дет/i.test(b)) {
    return "kids";
  }
  if (/(семей|родител|с\s+детьми|family)/i.test(b)) {
    return "family";
  }
  if (/(wakesurf|вейк|wake|букс|катер)/i.test(b) || /вейксерф/.test(p.title)) {
    return "wakesurf";
  }
  if (
    p.levelRequired === "beginner" ||
    p.levelRequired === "all_levels" ||
    /(нович|перв(ый|ого)|с\s+нуля|баз(ов|а))/i.test(b)
  ) {
    return "beginner";
  }
  return "wakesurf";
}

export function programMatchesChip(p: ProgramLike, chip: TourCategoryKey): boolean {
  if (chip === "all") return true;
  if (chip === "wakesurf") {
    const t = discText(p) + " " + norm(p.title);
    return /(wakesurf|вейк|wake|вейкс|букс|катер|водн)/i.test(t);
  }
  if (chip === "family") {
    return /(семей|родител|с\s+детьми|family|вместе)/i.test(blob(p));
  }
  if (chip === "kids") {
    return /(дет|детьми|детск|подрост|школ|family)/i.test(blob(p));
  }
  if (chip === "beginner") {
    const lv = p.levelRequired ?? "";
    if (lv === "beginner" || lv === "all_levels") return true;
    return /(нович|перв|с\s+нуля|базов|любой)/i.test(blob(p));
  }
  return true;
}

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
  title: string;
  location: string;
  dateLine: string;
  durationLine: string;
  levelLine: string;
  priceLabel: string;
  badge: (typeof BADGE_META)[BadgeKey];
};

const FALLBACK_IMAGES = ["/pilot-media/program-1.svg", "/pilot-media/program-2.svg", "/pilot-media/program-3.svg"];

function coverUrl(p: ProgramLike, index: number): { url: string; isRemote: boolean } {
  const raw =
    pickBestProgramCoverImageUrl(p.media, `${p.title} ${p.audienceFit ?? ""} ${p.itineraryDayByDay ?? ""}`) ??
    FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]!;
  const isRemote = /^https?:\/\//i.test(raw);
  return { url: raw, isRemote };
}

/** Статичные кадры, если API ещё пуст: сохраняем визуал киноленты. */
export const DEMO_TOUR_CARDS: TourCardModel[] = [
  {
    id: "demo-1",
    href: "/#programs",
    imageSrc: "/media/filmstrip/wakesurf/wasurf_1.jpg",
    isRemote: false,
    title: "Вейксерф-кэмп на Братском море",
    location: "Братск, Иркутская область",
    dateLine: "1–10 мая 2026 г.",
    durationLine: "10 дней / 9 ночей",
    levelLine: "Уровень: для любого уровня",
    priceLabel: "от 64 900 ₽",
    badge: BADGE_META.wakesurf,
  },
  {
    id: "demo-2",
    href: "/#programs",
    imageSrc: "/media/filmstrip/wakesurf/wasurf_2.jpg",
    isRemote: false,
    title: "Семейный вейк-уикенд",
    location: "Краснодарский край",
    dateLine: "12–15 июня 2026 г.",
    durationLine: "4 дня / 3 ночи",
    levelLine: "Уровень: с нуля",
    priceLabel: "от 42 000 ₽",
    badge: BADGE_META.family,
  },
  {
    id: "demo-3",
    href: "/#programs",
    imageSrc: "/media/filmstrip/ski/ski_kids_1.jpg",
    isRemote: false,
    title: "Детская лыжная школа в горах",
    location: "Сочи",
    dateLine: "5–19 января 2026 г.",
    durationLine: "15 дней / 14 ночей",
    levelLine: "Уровень: начинающий",
    priceLabel: "от 88 000 ₽",
    badge: BADGE_META.kids,
  },
  {
    id: "demo-4",
    href: "/#programs",
    imageSrc: "/media/filmstrip/mtb/mtbdh_1.jpg",
    isRemote: false,
    title: "MTB: маршрут для новичков",
    location: "Карелия",
    dateLine: "1–3 августа 2026 г.",
    durationLine: "3 дня / 2 ночи",
    levelLine: "Уровень: с нуля",
    priceLabel: "от 19 500 ₽",
    badge: BADGE_META.beginner,
  },
];

export function programToTourCard(p: ProgramLike, index: number): TourCardModel {
  const badgeKey = programPrimaryBadge(p);
  const badge = BADGE_META[badgeKey];
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
    title: p.title,
    location: loc,
    dateLine: formatDateRangeRu(p.startDate, p.endDate),
    durationLine,
    levelLine: lineLevelLabel(p),
    priceLabel: p.priceFromRub != null ? `от ${p.priceFromRub.toLocaleString("ru-RU")} ₽` : "Цена по запросу",
    badge,
  };
}
