"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getProgramLevelLabel } from "@mywave/shared-types";
import { Faq } from "../components/Faq";
import { HeroFilmstrip } from "../components/HeroFilmstrip";
import { HeroHotOfferSpotlight, type HotOfferSlide } from "../components/HeroHotOfferSpotlight";
import { LandingFooter } from "../components/LandingFooter";
import { ProgramCard } from "../components/ProgramCard";
import { Section } from "../components/Section";
import { SiteHeader, type SiteRole } from "../components/SiteHeader";
import { TrustBar } from "../components/TrustBar";
import type { FilmstripFrame } from "../content/filmstripHero";
import {
  faqItems,
  footer,
  forWhomCards,
  hero,
  organizersBlock,
  rolePathOrganizer,
  rolePathTraveler,
  trustCards,
} from "../content/pilotLanding";
import { getDisciplineCompactLabel, getDisciplineDisplay } from "../lib/disciplineLabels";
import { firstProgramCoverImageUrl } from "../lib/programCardCover";
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
  cta: string | null;
  organizer?: {
    displayName: string;
    verificationStatus: string;
    reviewCount?: number;
    ratingAvg?: number | null;
    verificationBadge?: string | null;
  };
  media?: { id?: string; url: string; mediaType: string }[];
};

const COUNTRY_BY_REGION: Record<string, string> = {
  krasnodar: "Россия",
  башкортостан: "Россия",
  алтай: "Россия",
  "нижний новгород": "Россия",
  "карачаево-черкесия": "Россия",
  архыз: "Россия",
  зилим: "Россия",
  russia: "Россия",
  россия: "Россия",
  dubai: "ОАЭ",
  uae: "ОАЭ",
  "оаэ": "ОАЭ",
  bodrum: "Турция",
  turkey: "Турция",
  turkiye: "Турция",
  турция: "Турция",
  chile: "Чили",
  чили: "Чили",
};

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Любой уровень" },
  { value: "beginner", label: "Начальный" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
  { value: "expert", label: "Экспертный" },
  { value: "all_levels", label: "Обозначено «любой»" },
];

function levelMatches(program: Program, filter: string): boolean {
  if (!filter) return true;
  const req = program.levelRequired ?? "";
  if (req === "all_levels") return true;
  return req === filter;
}

function normScope(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function disciplineSearchText(value: string | null | undefined): string {
  const display = getDisciplineDisplay(value);
  return normScope([display.original, display.translation].filter(Boolean).join(" "));
}

function getProgramCountry(program: Pick<Program, "region" | "exactLocation">): string {
  const candidates = [program.region, program.exactLocation]
    .map((value) => normScope(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (COUNTRY_BY_REGION[candidate]) {
      return COUNTRY_BY_REGION[candidate];
    }
  }

  const region = String(program.region ?? "").trim();
  return region;
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

function HomePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<SiteRole>("traveler");
  const [appliedDiscipline, setAppliedDiscipline] = useState("");
  const [appliedCountry, setAppliedCountry] = useState("");
  const [appliedRegion, setAppliedRegion] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [nearestStartsOnly, setNearestStartsOnly] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState<"" | SeasonKey>("");

  useEffect(() => {
    const discipline = searchParams.get("discipline") ?? "";
    const country = searchParams.get("country") ?? "";
    const region = searchParams.get("region") ?? "";
    setAppliedDiscipline(discipline);
    setAppliedCountry(country);
    setAppliedRegion(region);
  }, [searchParams]);

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

  const disciplineOptions = useMemo(() => {
    return [
      ...new Set(
        allPrograms.flatMap((program) => {
          const display = getDisciplineDisplay(program.discipline);
          return [display.original, display.translation].filter((value): value is string => Boolean(value));
        }),
      ),
    ].sort((left, right) => left.localeCompare(right, "ru"));
  }, [allPrograms]);

  const countryOptions = useMemo(() => {
    return [...new Set(allPrograms.map((program) => getProgramCountry(program).trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, "ru"),
    );
  }, [allPrograms]);

  const hasScopeFilters = Boolean(appliedDiscipline || appliedCountry || appliedRegion);

  const catalogPrograms = useMemo(() => {
    const wantD = appliedDiscipline ? normScope(appliedDiscipline) : null;
    const wantC = appliedCountry ? normScope(appliedCountry) : null;
    const wantR = appliedRegion ? normScope(appliedRegion) : null;
    return allPrograms.filter((p) => {
      const d = disciplineSearchText(p.discipline);
      const c = normScope(getProgramCountry(p));
      const r = regionSearchText(p);
      if (wantD && !d.includes(wantD)) return false;
      if (wantC && !c.includes(wantC)) return false;
      if (wantR && !r.includes(wantR)) return false;
      return true;
    });
  }, [allPrograms, appliedCountry, appliedDiscipline, appliedRegion]);

  const filtered = useMemo(() => {
    return catalogPrograms.filter((p) => {
      if (!levelMatches(p, levelFilter)) return false;
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
      return true;
    });
  }, [catalogPrograms, levelFilter, dateFrom, dateTo, nearestStartsOnly, seasonFilter]);

  const heroPrograms = catalogPrograms.length > 0 ? catalogPrograms : allPrograms;

  const heroMetrics = useMemo(() => {
    const programs = heroPrograms;
    const uniqueOrganizers = new Set(programs.map((program) => program.organizer?.displayName?.trim()).filter(Boolean));
    const uniqueRegions = new Set(programs.map((program) => normScope(program.region)).filter(Boolean));
    const trackedSpots = programs.reduce((sum, program) => {
      return sum + (typeof program.spotsAvailable === "number" ? program.spotsAvailable : 0);
    }, 0);
    const hasSpotData = programs.some((program) => typeof program.spotsAvailable === "number");
    return [
      { value: String(programs.length), label: "программ" },
      { value: String(uniqueOrganizers.size), label: "организаторов" },
      {
        value: String(hasSpotData ? trackedSpots : uniqueRegions.size),
        label: hasSpotData ? "мест сейчас" : "локации",
      },
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
        imageSrc: firstProgramCoverImageUrl(program.media) ?? HERO_FALLBACK_IMAGES[index % HERO_FALLBACK_IMAGES.length],
        kicker: `${getDisciplineCompactLabel(program.discipline)} · ${locationPart}`,
        timingLabel,
        metaLabel: facts.join(" · "),
        priceLabel: program.priceFromRub != null ? `от ${program.priceFromRub.toLocaleString("ru-RU")} ₽` : null,
        spotsLabel: program.spotsAvailable != null ? `осталось ${program.spotsAvailable} мест` : null,
        isStarred: Boolean(program.isStarred),
      };
    });
  }, [heroPrograms]);

  const heroFrames = useMemo<FilmstripFrame[]>(() => {
    return heroPrograms.slice(0, 8).map((program, index) => {
      const pricePart = program.priceFromRub != null ? `от ${program.priceFromRub.toLocaleString("ru-RU")} ₽` : null;
      const spotsPart =
        program.spotsAvailable != null
          ? `${program.spotsAvailable} ${program.spotsAvailable === 1 ? "место" : program.spotsAvailable < 5 ? "места" : "мест"}`
          : null;
      const locationPart = program.exactLocation?.trim() ? `${program.region} · ${program.exactLocation}` : program.region;
      const captionParts = [
        new Date(program.startDate).toLocaleDateString("ru-RU"),
        `${program.durationDays} дн.`,
        getProgramLevelLabel(program.levelRequired),
        pricePart,
        spotsPart ? `осталось ${spotsPart}` : null,
      ].filter(Boolean);

      return {
        id: program.id,
        imageSrc: firstProgramCoverImageUrl(program.media) ?? HERO_FALLBACK_IMAGES[index % HERO_FALLBACK_IMAGES.length],
        kicker: `${getDisciplineCompactLabel(program.discipline)} · ${locationPart}`,
        title: program.title,
        caption: captionParts.join(" · "),
        emphasis: index < 2 ? "pilot" : "breadth",
        href: `/program/${program.id}`,
      };
    });
  }, [heroPrograms]);

  const syncUrl = (next: { discipline: string; country: string; region: string }) => {
    const params = new URLSearchParams();
    if (next.discipline.trim()) params.set("discipline", next.discipline.trim());
    if (next.country.trim()) params.set("country", next.country.trim());
    if (next.region.trim()) params.set("region", next.region.trim());
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href, { scroll: false });
  };

  const catalogHrefBuilder = (next: { discipline?: string; country?: string; region?: string }) => {
    const params = new URLSearchParams();
    if (next.discipline?.trim()) params.set("discipline", next.discipline.trim());
    if (next.country?.trim()) params.set("country", next.country.trim());
    if (next.region?.trim()) params.set("region", next.region.trim());
    const qs = params.toString();
    return qs ? `${pathname}?${qs}#programs` : "/#programs";
  };

  const handleRoleChange = (r: SiteRole) => {
    setRole(r);
    const anchor = r === "traveler" ? "role-traveler" : "role-organizer";
    window.requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <SiteHeader
        role={role}
        onRoleChange={handleRoleChange}
        appliedDiscipline={appliedDiscipline}
        appliedCountry={appliedCountry}
        disciplineOptions={disciplineOptions}
        countryOptions={countryOptions}
        onApplyFilters={(d, c) => {
          setAppliedDiscipline(d);
          setAppliedCountry(c);
          setAppliedRegion("");
          syncUrl({ discipline: d, country: c, region: "" });
        }}
        onResetFilters={() => {
          setAppliedDiscipline("");
          setAppliedCountry("");
          setAppliedRegion("");
          setLevelFilter("");
          setDateFrom("");
          setDateTo("");
          setNearestStartsOnly(false);
          setSeasonFilter("");
          syncUrl({ discipline: "", country: "", region: "" });
        }}
      />
      <header className="mw-hero-visual mw-hero-visual--filmstrip">
        <div className="mw-container mw-hero-inner mw-hero-inner--filmstrip-top">
          <div className="mw-hero-panel">
            <div className="mw-hero-copy">
              <p className="mw-hero-kicker">MyWave Travel · каталог программ с фокусом на подготовку</p>
              <h1 className="mw-h1 mw-h1--filmstrip">{hero.title}</h1>
              <p className="mw-lead mw-lead--tight">{hero.subtitle}</p>
              <div className="mw-hero-metrics" aria-label="Краткая сводка по каталогу">
                {heroMetrics.map((metric) => (
                  <div key={metric.label} className="mw-hero-metric">
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
              <p className="mw-hero-footnote mw-hero-footnote--main">
                <strong>MyWave Travel помогает довести заявку до следующего шага без потери контекста.</strong> {hero.footnote}
              </p>
            </div>
            <HeroHotOfferSpotlight slides={hotOfferSlides} />
          </div>
        </div>
        <div className="mw-hero-filmstrip-shell">
          <div className="mw-hero-filmstrip-bleed mw-hero-filmstrip-bleed--fullwidth">
            {heroFrames.length > 0 && <HeroFilmstrip frames={heroFrames} hideIntro loop />}
          </div>
        </div>
      </header>

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

      <Section tight strip="white">
        <TrustBar cards={trustCards} />
      </Section>

      <Section
        id="programs"
        title="Актуальные программы"
        subtitle="Ниже — программы, которые уже оформлены по стандарту каталога и открыты для новых заявок."
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
              {appliedDiscipline && (
                <span className="mw-badge mw-badge--pilot">
                  Дисциплина: <strong style={{ marginLeft: 6 }}>{appliedDiscipline}</strong>
                </span>
              )}
              {appliedCountry && (
                <span className="mw-badge mw-badge--pilot">
                  Страна: <strong style={{ marginLeft: 6 }}>{appliedCountry}</strong>
                </span>
              )}
              {appliedRegion && (
                <span className="mw-badge mw-badge--pilot">
                  Регион / место: <strong style={{ marginLeft: 6 }}>{appliedRegion}</strong>
                </span>
              )}
              <button
                type="button"
                className="mw-btn mw-btn--ghost"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setAppliedDiscipline("");
                  setAppliedCountry("");
                  setAppliedRegion("");
                  setLevelFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setNearestStartsOnly(false);
                  setSeasonFilter("");
                  syncUrl({ discipline: "", country: "", region: "" });
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
          <div className="mw-field">
            <label htmlFor="flt-discipline">Дисциплина</label>
            <select
              id="flt-discipline"
              className="mw-select"
              value={appliedDiscipline}
              onChange={(e) => {
                const v = e.target.value;
                setAppliedDiscipline(v);
                syncUrl({ discipline: v, country: appliedCountry, region: appliedRegion });
              }}
            >
              <option value="">Любая</option>
              {disciplineOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              {appliedDiscipline.trim() && !disciplineOptions.includes(appliedDiscipline) ? (
                <option value={appliedDiscipline}>{appliedDiscipline}</option>
              ) : null}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="flt-level">Уровень</label>
            <select
              id="flt-level"
              className="mw-select"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value || "any"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mw-field">
            <label htmlFor="flt-from">Дата с</label>
            <input
              id="flt-from"
              className="mw-input"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
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
              onChange={(e) => setSeasonFilter(e.target.value as "" | SeasonKey)}
            >
              <option value="">Любой</option>
              <option value="winter">Зима (дек–фев)</option>
              <option value="spring">Весна (мар–май)</option>
              <option value="summer">Лето (июн–авг)</option>
              <option value="autumn">Осень (сен–ноя)</option>
            </select>
          </div>
          <div className="mw-field" style={{ alignSelf: "end" }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={nearestStartsOnly}
                onChange={(e) => setNearestStartsOnly(e.target.checked)}
              />
              <span>Ближайшие старты (14 дней)</span>
            </label>
          </div>
        </div>
        <StartAlertsSignup discipline={appliedDiscipline} region={appliedRegion || undefined} />
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
        {!loading && filtered.length === 0 && catalogPrograms.length > 0 && (
          <p>
            Нет программ по выбранным фильтрам (дисциплина, уровень, даты, сезон или «ближайшие старты»). Сбросьте фильтры или расширьте диапазон дат.
          </p>
        )}
        {!loading && catalogPrograms.length === 0 && allPrograms.length > 0 && (
          <p>Нет программ по выбранным фильтрам. Сбросьте фильтры в шапке или измените параметры.</p>
        )}
        {!loading && allPrograms.length === 0 && <p>Пока нет опубликованных программ.</p>}
        {!loading && filtered.length > 0 && (
          <div className="program-grid">
            {filtered.map((p) => (
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
