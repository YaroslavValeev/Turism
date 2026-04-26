"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getProgramLevelLabel } from "@mywave/shared-types";
import { Faq } from "../components/Faq";
import { ToursFilmstrip } from "../components/ToursFilmstrip";
import { HeroHotOfferSpotlight, type HotOfferSlide } from "../components/HeroHotOfferSpotlight";
import { LandingFooter } from "../components/LandingFooter";
import { ProgramCard } from "../components/ProgramCard";
import { ProgramRailCard } from "../components/ProgramRailCard";
import { Section } from "../components/Section";
import { SiteHeader, type SiteRole } from "../components/SiteHeader";
import {
  faqItems,
  footer,
  forWhomCards,
  hero,
  organizersBlock,
  rolePathOrganizer,
  rolePathTraveler,
  russiaRegionExamples,
  trustCards,
  tripFormatExamples,
} from "../content/pilotLanding";
import { dedupeProgramListingsByEvent } from "../lib/dedupeProgramListingsByEvent";
import { getDisciplineCompactLabel, getDisciplineDisplay } from "../lib/disciplineLabels";
import { pickBestProgramCoverImageUrl } from "../lib/programCardCover";
import { ruPluralNoun } from "../lib/ruPlural";
import { StartAlertsSignup } from "../components/StartAlertsSignup";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Program = {
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
  capacityTotal?: number | null;
  spotsAvailable?: number | null;
  isStarred?: boolean;
  audienceFit: string | null;
  itineraryDayByDay?: string | null;
  riskLevel?: string | null;
  cta: string | null;
  organizer?: {
    id?: string;
    displayName: string;
    verificationStatus: string;
    reviewCount?: number;
    ratingAvg?: number | null;
    verificationBadge?: string | null;
  };
  media?: { id?: string; url: string; mediaType: string }[];
  autoPublished?: boolean;
  sourceType?: string | null;
  sourceUrl?: string | null;
  reviewStatus?: string | null;
};

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Любой уровень" },
  { value: "beginner", label: "Начальный" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
  { value: "expert", label: "Экспертный" },
  { value: "all_levels", label: "Обозначено «любой»" },
];

const LEVEL_VALUE_SET = new Set(LEVEL_OPTIONS.map((o) => o.value).filter(Boolean));

function levelMatchesOne(program: Program, filter: string): boolean {
  if (!filter) return true;
  const req = program.levelRequired ?? "";
  if (req === "all_levels") return true;
  return req === filter;
}

function levelMatchesAny(program: Program, filters: string[]): boolean {
  if (filters.length === 0) return true;
  return filters.some((f) => levelMatchesOne(program, f));
}

function normScope(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function disciplineSearchText(value: string | null | undefined): string {
  const display = getDisciplineDisplay(value);
  return normScope([display.original, display.translation].filter(Boolean).join(" "));
}

function formatHeroDate(dateString: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(dateString));
}

function getDaysUntilStart(dateString: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

type SeasonKey = "winter" | "spring" | "summer" | "autumn";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function programStartsWithinDays(program: Program, days: number): boolean {
  const now = startOfDay(new Date());
  const limit = new Date(now);
  limit.setDate(limit.getDate() + days);
  const start = startOfDay(new Date(program.startDate));
  return start >= now && start <= limit;
}

function seasonOfProgramStart(program: Program): SeasonKey {
  const m = new Date(program.startDate).getMonth() + 1;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

const HERO_FALLBACK_IMAGES = [
  "/pilot-media/program-1.svg",
  "/pilot-media/program-2.svg",
  "/pilot-media/program-3.svg",
];

function regionSearchText(program: Pick<Program, "region" | "exactLocation">): string {
  const parts = [program.region, program.exactLocation].map((value) => String(value ?? "").trim()).filter(Boolean);
  return normScope(parts.join(" "));
}

function programBlob(program: Program): string {
  return normScope(
    [program.title, program.region, program.exactLocation, program.audienceFit, disciplineSearchText(program.discipline)].join(" "),
  );
}

function isWinterDiscipline(program: Pick<Program, "title" | "discipline">): boolean {
  const text = normScope([program.title, disciplineSearchText(program.discipline)].join(" "));
  return /(лыж|ski|snow|сноуборд|фрирайд|ски-тур|ski-tour|ski tour|снегоход)/i.test(text);
}

type ScenarioExtra = null | "kids" | "weekend";

function HomePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<SiteRole>("traveler");
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  /** Подстрока региона / локации в РФ (query `region`, ранее мог быть `country`). */
  const [appliedRegionQuery, setAppliedRegionQuery] = useState("");
  const [levelFilters, setLevelFilters] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [nearestStartsOnly, setNearestStartsOnly] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState<"" | SeasonKey>("");
  const [scenarioExtra, setScenarioExtra] = useState<ScenarioExtra>(null);

  const readSeasonFromQuery = useCallback((raw: string | null): "" | SeasonKey => {
    const s = (raw ?? "").trim().toLowerCase();
    if (s === "winter" || s === "spring" || s === "summer" || s === "autumn") return s;
    return "";
  }, []);

  useEffect(() => {
    setSelectedDisciplines(searchParams.getAll("discipline").map((s) => s.trim()).filter(Boolean));

    const region = searchParams.get("region") ?? "";
    const legacyCountry = searchParams.get("country") ?? "";
    setAppliedRegionQuery(region.trim() ? region : legacyCountry);
    setNearestStartsOnly(searchParams.get("nearest") === "1");
    setSeasonFilter(readSeasonFromQuery(searchParams.get("season")));

    const fromLevels = searchParams.getAll("level").map((s) => s.trim()).filter((s) => LEVEL_VALUE_SET.has(s));
    setLevelFilters(fromLevels);
  }, [searchParams, readSeasonFromQuery]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadPrograms = async (attempt = 0) => {
      try {
        const response = await fetch(`${API_URL}/programs`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setAllPrograms(list);
        setCatalogLoadError(null);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить каталог";
        setCatalogLoadError(message);
        if (attempt < 5) {
          retryTimer = setTimeout(() => {
            void loadPrograms(attempt + 1);
          }, 2000 * (attempt + 1));
          return;
        }
        setAllPrograms([]);
        setLoading(false);
      }
    };

    void loadPrograms();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  /** Каталог без дубликатов одного и того же выезда (несколько сущностей с одними датами/гео). */
  const programsCatalogUnique = useMemo(
    () => dedupeProgramListingsByEvent(allPrograms),
    [allPrograms],
  );

  const disciplineOptions = useMemo(() => {
    return [
      ...new Set(
        programsCatalogUnique.flatMap((program) => {
          const display = getDisciplineDisplay(program.discipline);
          return [display.original, display.translation].filter((value): value is string => Boolean(value));
        }),
      ),
    ].sort((left, right) => left.localeCompare(right, "ru"));
  }, [programsCatalogUnique]);

  const regionFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of programsCatalogUnique) {
      const r = String(p.region ?? "").trim();
      if (r) set.add(r);
      const ex = String(p.exactLocation ?? "").trim();
      if (ex) set.add(ex);
    }
    for (const x of russiaRegionExamples) {
      set.add(x);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [programsCatalogUnique]);

  const disciplineCheckboxOptions = useMemo(() => {
    const set = new Set(disciplineOptions);
    for (const d of selectedDisciplines) {
      if (d.trim()) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [disciplineOptions, selectedDisciplines]);

  const hasScopeFilters = Boolean(
    selectedDisciplines.length > 0 ||
      appliedRegionQuery ||
      nearestStartsOnly ||
      seasonFilter ||
      scenarioExtra ||
      levelFilters.length > 0 ||
      dateFrom ||
      dateTo,
  );

  const catalogPrograms = useMemo(() => {
    const wantsD = selectedDisciplines.map((x) => normScope(x)).filter(Boolean);
    const wantR = appliedRegionQuery ? normScope(appliedRegionQuery) : null;
    return programsCatalogUnique.filter((p) => {
      const d = disciplineSearchText(p.discipline);
      const r = regionSearchText(p);
      if (wantsD.length > 0 && !wantsD.some((w) => d.includes(w))) return false;
      if (wantR && !r.includes(wantR)) return false;
      return true;
    });
  }, [programsCatalogUnique, selectedDisciplines, appliedRegionQuery]);

  const filtered = useMemo(() => {
    return catalogPrograms.filter((p) => {
      if (!levelMatchesAny(p, levelFilters)) return false;
      if (nearestStartsOnly && !programStartsWithinDays(p, 14)) return false;
      if (seasonFilter && seasonOfProgramStart(p) !== seasonFilter) return false;
      if (dateFrom) {
        const start = new Date(p.startDate);
        const from = new Date(dateFrom);
        if (start < from) return false;
      }
      if (dateTo) {
        const start = new Date(p.startDate);
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (start > to) return false;
      }
      if (scenarioExtra === "kids") {
        const b = programBlob(p);
        if (!/(дет|детьми|семей|family|родител)/i.test(b)) return false;
      }
      if (scenarioExtra === "weekend") {
        if (p.durationDays > 4) return false;
      }
      return true;
    });
  }, [catalogPrograms, levelFilters, dateFrom, dateTo, nearestStartsOnly, seasonFilter, scenarioExtra]);

  /** Сетка «Все программы»: как в герое — сначала точные фильтры, иначе каталог по дисциплине/региону, иначе весь опубликованный список. */
  const programGrid = useMemo(() => {
    if (filtered.length > 0) {
      return { list: filtered, notice: null as string | null };
    }
    if (catalogPrograms.length > 0) {
      return {
        list: catalogPrograms,
        notice: "Сужающие фильтры (уровень, даты, сезон…) никого не прошли. Ниже — весь набор в выбранных дисциплине и регионе.",
      };
    }
    if (programsCatalogUnique.length > 0) {
      return {
        list: programsCatalogUnique,
        notice: "По дисциплине/региону из ссылки совпадений нет. Показан весь опубликованный каталог.",
      };
    }
    return { list: [] as Program[], notice: null as string | null };
  }, [filtered, catalogPrograms, programsCatalogUnique]);

  const heroPrograms = catalogPrograms.length > 0 ? catalogPrograms : programsCatalogUnique;

  const heroMetrics = useMemo(() => {
    const programs = heroPrograms;
    const uniqueOrganizers = new Set(
      programs.map((p) => {
        const id = p.organizer?.id?.trim();
        if (id) return `id:${id}`;
        const name = p.organizer?.displayName?.trim();
        return name ? `name:${name}` : "";
      }).filter(Boolean),
    );
    const uniqueRegions = new Set(programs.map((program) => normScope(program.region)).filter(Boolean));
    const upcomingWeekPrograms = programs.filter((program) => programStartsWithinDays(program, 7));
    const trackedWeekSpots = upcomingWeekPrograms.reduce((sum, program) => {
      return sum + (typeof program.spotsAvailable === "number" ? Math.max(0, program.spotsAvailable) : 0);
    }, 0);
    const hasWeekSpotData = upcomingWeekPrograms.some((program) => typeof program.spotsAvailable === "number");
    const weekSpotsMetric = hasWeekSpotData
      ? trackedWeekSpots <= 2
        ? { value: "есть", label: "места на 7 дней" }
        : { value: String(trackedWeekSpots), label: "мест на 7 дней" }
      : {
          value: String(uniqueRegions.size),
          label: ruPluralNoun(uniqueRegions.size, ["регион", "региона", "регионов"]),
        };
    return [
      {
        value: String(programs.length),
        label: ruPluralNoun(programs.length, ["программа", "программы", "программ"]),
      },
      {
        value: String(uniqueOrganizers.size),
        label: ruPluralNoun(uniqueOrganizers.size, ["организатор", "организатора", "организаторов"]),
      },
      weekSpotsMetric,
    ];
  }, [heroPrograms]);

  const hotOfferSlides = useMemo<HotOfferSlide[]>(() => {
    const upcomingPrograms = [...heroPrograms].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
    const annotated = upcomingPrograms.map((program, index) => ({
      program,
      index,
      daysUntilStart: getDaysUntilStart(program.startDate),
    }));
    const starredSoon = annotated.filter(
      (item) => item.program.isStarred && item.daysUntilStart >= 0 && item.daysUntilStart <= 7,
    );
    const starredAny = annotated.filter((item) => item.program.isStarred);
    const soonAny = annotated.filter((item) => item.daysUntilStart >= 0 && item.daysUntilStart <= 7);
    const selected = (starredSoon.length > 0 ? starredSoon : starredAny.length > 0 ? starredAny : soonAny.length > 0 ? soonAny : annotated).slice(0, 5);

    return selected.map(({ program, index, daysUntilStart }) => {
      const locationPart = program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region;
      const timingLabel =
        daysUntilStart < 0
          ? `Следующий выезд · ${formatHeroDate(program.startDate)}`
          : daysUntilStart === 0
            ? "Старт сегодня"
            : daysUntilStart === 1
              ? "Старт завтра"
              : daysUntilStart <= 7
                ? `Старт через ${daysUntilStart} дн.`
                : `Старт ${formatHeroDate(program.startDate)}`;

      const facts = [`${formatHeroDate(program.startDate)} · ${program.durationDays} дн.`, getProgramLevelLabel(program.levelRequired)];

      return {
        id: program.id,
        title: program.title,
        href: `/program/${program.id}`,
        imageSrc:
          pickBestProgramCoverImageUrl(program.media, `${program.title} ${program.audienceFit ?? ""} ${program.itineraryDayByDay ?? ""}`) ??
          HERO_FALLBACK_IMAGES[index % HERO_FALLBACK_IMAGES.length],
        kicker: `${getDisciplineCompactLabel(program.discipline)} · ${locationPart}`,
        timingLabel,
        metaLabel: facts.join(" · "),
        priceLabel: program.priceFromRub != null ? `от ${program.priceFromRub.toLocaleString("ru-RU")} ₽` : null,
        spotsLabel: program.spotsAvailable != null ? `осталось ${program.spotsAvailable} мест` : null,
        isStarred: Boolean(program.isStarred),
      };
    });
  }, [heroPrograms]);

  const syncToUrl = useCallback(
    (next: {
      disciplines?: string[];
      region?: string;
      nearest?: boolean;
      season?: "" | SeasonKey;
      levels?: string[];
    }) => {
      const params = new URLSearchParams();
      const d = next.disciplines ?? selectedDisciplines;
      for (const x of d) {
        if (x.trim()) params.append("discipline", x.trim());
      }
      const r = next.region ?? appliedRegionQuery;
      if (r.trim()) params.set("region", r.trim());
      if (next.nearest ?? nearestStartsOnly) params.set("nearest", "1");
      const s = next.season !== undefined ? next.season : seasonFilter;
      if (s) params.set("season", s);
      const lv = next.levels !== undefined ? next.levels : levelFilters;
      for (const x of lv) {
        if (x && LEVEL_VALUE_SET.has(x)) params.append("level", x);
      }
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router, selectedDisciplines, appliedRegionQuery, nearestStartsOnly, seasonFilter, levelFilters],
  );

  const catalogHrefBuilder = (next: { discipline?: string; disciplines?: string[]; region?: string }) => {
    const params = new URLSearchParams();
    if (next.disciplines?.length) {
      for (const x of next.disciplines) {
        if (x.trim()) params.append("discipline", x.trim());
      }
    } else if (next.discipline?.trim()) {
      params.set("discipline", next.discipline.trim());
    }
    if (next.region?.trim()) params.set("region", next.region.trim());
    const qs = params.toString();
    return qs ? `${pathname}?${qs}#programs` : "/#programs";
  };

  const railNearest = useMemo(
    () =>
      [...programsCatalogUnique]
        .filter((p) => programStartsWithinDays(p, 45))
        .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
        .slice(0, 6),
    [programsCatalogUnique],
  );
  const railWinter = useMemo(() => {
    return programsCatalogUnique
      .filter((p) => isWinterDiscipline(p))
      .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
      .slice(0, 12);
  }, [programsCatalogUnique]);
  const railShort = useMemo(
    () => programsCatalogUnique.filter((p) => p.durationDays >= 2 && p.durationDays <= 4).slice(0, 6),
    [programsCatalogUnique],
  );

  const handleRoleChange = (r: SiteRole) => {
    setRole(r);
    const anchor = r === "traveler" ? "role-traveler" : "role-organizer";
    window.requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const scrollToPrograms = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("programs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <SiteHeader
        role={role}
        onRoleChange={handleRoleChange}
        appliedDisciplines={selectedDisciplines}
        appliedRegionFilter={appliedRegionQuery}
        disciplineOptions={disciplineOptions}
        regionFilterOptions={regionFilterOptions}
        onApplyFilters={(d, r) => {
          setSelectedDisciplines(d);
          setAppliedRegionQuery(r);
          setScenarioExtra(null);
          syncToUrl({ disciplines: d, region: r, nearest: nearestStartsOnly, season: seasonFilter, levels: levelFilters });
        }}
        onResetFilters={() => {
          setSelectedDisciplines([]);
          setAppliedRegionQuery("");
          setLevelFilters([]);
          setDateFrom("");
          setDateTo("");
          setNearestStartsOnly(false);
          setSeasonFilter("");
          setScenarioExtra(null);
          syncToUrl({ disciplines: [], region: "", nearest: false, season: "", levels: [] });
        }}
      />
      <header className="mw-hero-visual mw-hero-visual--filmstrip">
        <div className="mw-container mw-hero-inner mw-hero-inner--filmstrip-top">
          <div className="mw-hero-panel">
            <div className="mw-hero-copy">
              <p className="mw-hero-kicker">MyWaveTour · спортивные выезды по России</p>
              <h1 className="mw-h1 mw-h1--filmstrip">{hero.title}</h1>
              <p className="mw-lead mw-lead--tight">{hero.subtitle}</p>
              <div className="mw-hero-metrics" aria-label="Краткая сводка по каталогу">
                {heroMetrics.map((metric, i) => (
                  <div key={`${metric.label}-${i}`} className="mw-hero-metric">
                    <span className="mw-hero-metric__value">{metric.value}</span>
                    <span className="mw-hero-metric__label">{metric.label}</span>
                  </div>
                ))}
              </div>
              <div className="mw-hero-cta-row mw-hero-cta-row--main">
                <a href="#programs" className="mw-btn mw-btn--primary">
                  {hero.ctaCatalog}
                </a>
                <Link href="/organizers/program" className="mw-btn mw-btn--ghost">
                  {hero.ctaOrganizers}
                </Link>
              </div>
              <p className="mw-hero-footnote mw-hero-footnote--main">{hero.footnote}</p>
              <ul className="mw-factual-strip" aria-label="Коротко о платформе">
                {trustCards.map((c) => (
                  <li key={c.title} className="mw-factual-strip__item">
                    <strong>{c.title}</strong>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <HeroHotOfferSpotlight slides={hotOfferSlides} />
          </div>
        </div>
        <div className="mw-hero-filmstrip-bleed mw-hero-filmstrip-bleed--fullwidth">
          <div className="mw-container mw-hero-filmstrip-shell mw-hero-filmstrip-shell--tours">
            <ToursFilmstrip programs={heroPrograms} regionOptions={regionFilterOptions} loading={loading} allToursHref="/#programs" />
          </div>
        </div>
      </header>

      {!loading && programsCatalogUnique.length > 0 && (
        <>
          <Section title="Ближайшие старты" subtitle="Программы, которые стартуют совсем скоро." strip="muted">
            <div className="program-rail-grid">
              {railNearest.map((p) => (
                <ProgramRailCard key={p.id} program={p} levelLabel={getProgramLevelLabel(p.levelRequired)} catalogHrefBuilder={catalogHrefBuilder} />
              ))}
            </div>
          </Section>
          <Section title="Зимние выезды" subtitle="Все программы по зимним дисциплинам: лыжи, сноуборд, фрирайд и смежные форматы." strip="white">
            {railWinter.length > 0 ? (
              <div className="program-rail-grid">
                {railWinter.map((p) => (
                  <ProgramRailCard key={p.id} program={p} levelLabel={getProgramLevelLabel(p.levelRequired)} catalogHrefBuilder={catalogHrefBuilder} />
                ))}
              </div>
            ) : (
              <p style={{ margin: "6px 0 0", color: "var(--mw-muted)" }}>
                Сейчас нет опубликованных программ по зимним дисциплинам. Проверьте позже или откройте общий список программ.
              </p>
            )}
          </Section>
          <Section title="Короткие выезды 2–4 дня" subtitle="Удобно для первого знакомства с форматом." strip="muted">
            <div className="program-rail-grid">
              {railShort.map((p) => (
                <ProgramRailCard key={p.id} program={p} levelLabel={getProgramLevelLabel(p.levelRequired)} catalogHrefBuilder={catalogHrefBuilder} />
              ))}
            </div>
          </Section>
        </>
      )}

      <Section id="catalog-entries" title="Каталог по России" subtitle="Четыре входа: регион, дисциплина, сезон и формат поездки." strip="white">
        <div className="mw-catalog-entry-grid">
          <div className="mw-card">
            <h3 className="mw-h3">По регионам</h3>
            <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.95rem" }}>Подборка по локации в РФ.</p>
            <div className="mw-tag-row">
              {russiaRegionExamples.slice(0, 8).map((tag) => (
                <Link key={tag} href={catalogHrefBuilder({ region: tag })} className="mw-tag-link">
                  {tag}
                </Link>
              ))}
            </div>
          </div>
          <div className="mw-card">
            <h3 className="mw-h3">По дисциплинам</h3>
            <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.95rem" }}>Выбери дисциплину и собери свой маршрут прогресса.</p>
            <Link href="/#programs" className="mw-btn mw-btn--ghost">
              Открыть программы
            </Link>
          </div>
          <div className="mw-card" id="programs-season">
            <h3 className="mw-h3">По сезонам</h3>
            <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.95rem" }}>Зима, весна, лето или осень старта.</p>
            <div className="mw-tag-row">
              {(["winter", "spring", "summer", "autumn"] as const).map((s) => {
                const label = s === "winter" ? "Зима" : s === "spring" ? "Весна" : s === "summer" ? "Лето" : "Осень";
                const href = `/?season=${s}#programs`;
                return (
                  <Link key={s} href={href} className="mw-tag-link">
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="mw-card">
            <h3 className="mw-h3">По формату</h3>
            <p style={{ margin: "0 0 12px", color: "var(--mw-muted)", fontSize: "0.95rem" }}>Кэмп, программа, clinic, выходные…</p>
            <div className="mw-tag-row">
              {tripFormatExamples.map((tag) => (
                <Link key={tag} href={catalogHrefBuilder({ discipline: tag })} className="mw-tag-link">
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="role-traveler"
        className="mw-role-path-anchor"
        title={rolePathTraveler.title}
        subtitle={rolePathTraveler.lead}
        strip="white"
      >
        <div className="mw-role-path-grid">
          {rolePathTraveler.steps.map((s, i) => (
            <div key={s.title} className="mw-role-path-card">
              <h3 className="mw-h3">
                {i + 1}. {s.title}
              </h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="role-organizer"
        className="mw-role-path-anchor"
        title={rolePathOrganizer.title}
        subtitle={rolePathOrganizer.lead}
        strip="muted"
      >
        <div className="mw-role-path-grid">
          {rolePathOrganizer.steps.map((s, i) => (
            <div key={s.title} className="mw-role-path-card">
              <h3 className="mw-h3">
                {i + 1}. {s.title}
              </h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="reviews-note" title="Отзывы участников" strip="white">
        <p style={{ margin: 0, color: "var(--mw-muted)", lineHeight: 1.6, maxWidth: "70ch" }}>
          Репутация на платформе строится на отзывах и оценках после поездок, а не на ярлыках «проверенный организатор». В карточке программы отображаются средняя оценка и число отзывов, когда
          данных достаточно; для новых программ показывается нейтральная подпись.
        </p>
      </Section>

      <Section
        id="programs"
        title="Актуальные программы"
        subtitle="Выезды по России: выбирай программу, уровень и формат, а дальше выходи на прямой контакт с организатором."
        strip="white"
      >
        {hasScopeFilters && (
          <div
            className="mw-card"
            style={{
              marginTop: 0,
              marginBottom: 16,
              padding: "12px 14px",
              borderColor: "rgba(13,148,136,0.25)",
              background: "rgba(13,148,136,0.06)",
            }}
            aria-label="Активные фильтры каталога"
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--mw-text)" }}>Активные фильтры</span>
              {selectedDisciplines.length > 0 &&
                selectedDisciplines.map((d) => (
                  <span key={d} className="mw-badge mw-badge--pilot">
                    Дисциплина: <strong style={{ marginLeft: 6 }}>{d}</strong>
                  </span>
                ))}
              {appliedRegionQuery && (
                <span className="mw-badge mw-badge--pilot">
                  Регион: <strong style={{ marginLeft: 6 }}>{appliedRegionQuery}</strong>
                </span>
              )}
              {nearestStartsOnly && <span className="mw-badge mw-badge--pilot">Ближайшие старты (14 дней)</span>}
              {seasonFilter && (
                <span className="mw-badge mw-badge--pilot">
                  Сезон: <strong style={{ marginLeft: 6 }}>{seasonFilter}</strong>
                </span>
              )}
              {scenarioExtra === "kids" && <span className="mw-badge mw-badge--pilot">Сценарий: с детьми</span>}
              {scenarioExtra === "weekend" && <span className="mw-badge mw-badge--pilot">Сценарий: 2–4 дня</span>}
              {levelFilters.length > 0 &&
                levelFilters.map((lf) => (
                  <span key={lf} className="mw-badge mw-badge--pilot">
                    Уровень: <strong style={{ marginLeft: 6 }}>{LEVEL_OPTIONS.find((o) => o.value === lf)?.label}</strong>
                  </span>
                ))}
              <button
                type="button"
                className="mw-btn mw-btn--ghost"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setSelectedDisciplines([]);
                  setAppliedRegionQuery("");
                  setLevelFilters([]);
                  setDateFrom("");
                  setDateTo("");
                  setNearestStartsOnly(false);
                  setSeasonFilter("");
                  setScenarioExtra(null);
                  syncToUrl({ disciplines: [], region: "", nearest: false, season: "", levels: [] });
                }}
              >
                Сбросить всё
              </button>
            </div>
            <p style={{ margin: "10px 0 0", color: "var(--mw-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
              Фильтры отражены в адресной строке: можно делиться ссылкой на подборку и возвращаться к ней без потери контекста.
            </p>
          </div>
        )}
        <div className="mw-filter-bar" aria-label="Фильтры списка программ для участников">
          <div className="mw-field mw-field--filter-accordion">
            <details className="mw-filter-accordion">
              <summary className="mw-filter-accordion__summary" id="flt-discipline-legend">
                <span>Дисциплины</span>
                {selectedDisciplines.length > 0 ? (
                  <span className="mw-filter-accordion__badge" aria-label={`Выбрано: ${selectedDisciplines.length}`}>
                    {selectedDisciplines.length}
                  </span>
                ) : null}
              </summary>
              <div className="mw-filter-accordion__body">
                <p className="mw-multiselect-hint">Можно выбрать несколько. Пусто = любые.</p>
                <div
                  className="mw-multiselect-options"
                  role="group"
                  aria-labelledby="flt-discipline-legend"
                >
                  {disciplineCheckboxOptions.map((d) => {
                    const on = selectedDisciplines.includes(d);
                    return (
                      <label key={d}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const next = on ? selectedDisciplines.filter((x) => x !== d) : [...selectedDisciplines, d];
                            setSelectedDisciplines(next);
                            syncToUrl({
                              disciplines: next,
                              region: appliedRegionQuery,
                              nearest: nearestStartsOnly,
                              season: seasonFilter,
                              levels: levelFilters,
                            });
                          }}
                        />
                        {d}
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
          <div className="mw-field mw-field--filter-accordion">
            <details className="mw-filter-accordion">
              <summary className="mw-filter-accordion__summary" id="flt-region-legend">
                <span>Регион</span>
                {appliedRegionQuery.trim() ? <span className="mw-filter-accordion__badge mw-filter-accordion__badge--dot" aria-label="Регион задан" title="Регион задан" /> : null}
              </summary>
              <div className="mw-filter-accordion__body">
                <p className="mw-multiselect-hint">Поиск по подстроке: регион, город, локация. Пусто = вся РФ в каталоге.</p>
                <input
                  id="flt-region"
                  className="mw-input"
                  list="flt-region-datalist"
                  value={appliedRegionQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAppliedRegionQuery(v);
                    syncToUrl({ region: v, disciplines: selectedDisciplines, nearest: nearestStartsOnly, season: seasonFilter, levels: levelFilters });
                  }}
                  placeholder="Например: Сочи, Кавказ, Алтай"
                  autoComplete="off"
                />
                <datalist id="flt-region-datalist">
                  {regionFilterOptions.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>
            </details>
          </div>
          <div className="mw-field mw-field--filter-accordion">
            <details className="mw-filter-accordion">
              <summary className="mw-filter-accordion__summary" id="flt-level-legend">
                <span>Уровень</span>
                {levelFilters.length > 0 ? (
                  <span className="mw-filter-accordion__badge" aria-label={`Выбрано: ${levelFilters.length}`}>
                    {levelFilters.length}
                  </span>
                ) : null}
              </summary>
              <div className="mw-filter-accordion__body">
                <p className="mw-multiselect-hint">Несколько уровней — по ИЛИ. Пусто = любой.</p>
                <div className="mw-multiselect-options" role="group" aria-labelledby="flt-level-legend">
                  {LEVEL_OPTIONS.filter((o) => o.value).map((o) => {
                    const on = levelFilters.includes(o.value);
                    return (
                      <label key={o.value}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const next = on ? levelFilters.filter((x) => x !== o.value) : [...levelFilters, o.value];
                            setLevelFilters(next);
                            syncToUrl({ levels: next });
                          }}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
          <div className="mw-field">
            <label htmlFor="flt-from">Дата с</label>
            <input id="flt-from" className="mw-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="mw-field">
            <label htmlFor="flt-to">Дата по</label>
            <input id="flt-to" className="mw-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="mw-field">
            <label htmlFor="flt-season">Сезон старта</label>
            <select
              id="flt-season"
              className="mw-select"
              value={seasonFilter}
              onChange={(e) => {
                const v = e.target.value as "" | SeasonKey;
                setSeasonFilter(v);
                syncToUrl({ season: v });
              }}
            >
              <option value="">Любой</option>
              <option value="winter">Зима (дек–фев)</option>
              <option value="spring">Весна (мар–май)</option>
              <option value="summer">Лето (июн–авг)</option>
              <option value="autumn">Осень (сен–ноя)</option>
            </select>
          </div>
          <div className="mw-field mw-field--nearest" style={{ alignSelf: "end" }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={nearestStartsOnly}
                onChange={(e) => {
                  const v = e.target.checked;
                  setNearestStartsOnly(v);
                  syncToUrl({ nearest: v });
                }}
              />
              <span>Ближайшие старты (14 дней)</span>
            </label>
          </div>
        </div>
        <StartAlertsSignup
          discipline={selectedDisciplines.length ? selectedDisciplines.join(", ") : undefined}
          region={appliedRegionQuery || undefined}
        />
        {loading && (
          <p style={{ color: "var(--mw-muted)" }}>
            Загрузка каталога… Убедитесь, что API запущен ({API_URL}).
          </p>
        )}
        {!loading && catalogLoadError && allPrograms.length === 0 && (
          <p style={{ color: "var(--mw-muted)" }}>
            Не удалось подключиться к каталогу с первой попытки. Повторите загрузку страницы. Техническая деталь: {catalogLoadError}
          </p>
        )}
        {!loading && programGrid.notice && (
          <p style={{ color: "var(--mw-muted)", maxWidth: "70ch" }} role="status">
            {programGrid.notice}
          </p>
        )}
        {!loading && programsCatalogUnique.length === 0 && <p>Пока нет опубликованных программ.</p>}
        {!loading && programGrid.list.length > 0 && (
          <div className="program-grid">
            {programGrid.list.map((p) => (
              <ProgramCard key={p.id} program={p} levelLabel={getProgramLevelLabel(p.levelRequired)} catalogHrefBuilder={catalogHrefBuilder} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Для кого этот формат" strip="warm">
        <div className="trust-grid">
          {forWhomCards.map((c) => (
            <div key={c.title} className="mw-card">
              <h3 className="mw-h3">{c.title}</h3>
              <p style={{ margin: 0, fontSize: "0.96rem", color: "var(--mw-muted)", lineHeight: 1.55 }}>{c.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="organizers" title={organizersBlock.title} subtitle={organizersBlock.intro} strip="white">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link href={organizersBlock.hrefProgram} className="mw-btn mw-btn--primary">
            {organizersBlock.ctaProgram}
          </Link>
          <Link href={organizersBlock.hrefVerification} className="mw-btn mw-btn--ghost">
            {organizersBlock.ctaVerification}
          </Link>
        </div>
        <p style={{ marginTop: 16, fontSize: "0.92rem", color: "var(--mw-muted)", maxWidth: "62ch" }}>
          Нужен только email? Связаться с командой:{" "}
          <a href={organizersBlock.mailtoProgram}>заявка на программу</a>
          {" · "}
          <a href={organizersBlock.mailtoVerification}>вопрос по верификации</a>.
        </p>
      </Section>

      <Section id="faq" title="Вопросы и ответы" strip="warm">
        <Faq items={faqItems} />
      </Section>

      <LandingFooter brand={footer.brand} tagline={footer.tagline} links={footer.links} />
    </>
  );
}

export function HomePage() {
  return (
    <Suspense fallback={<main className="mw-container" style={{ padding: "3rem 0" }}><p style={{ color: "var(--mw-muted)" }}>Загрузка каталога…</p></main>}>
      <HomePageInner />
    </Suspense>
  );
}
