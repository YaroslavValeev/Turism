"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProgramLevelLabel } from "@mywave/shared-types";
import { SiteHeader } from "../components/SiteHeader";
import { ProgramCard } from "../components/ProgramCard";
import { Faq } from "../components/Faq";
import { LandingFooter } from "../components/LandingFooter";
import { StartAlertsSignup } from "../components/StartAlertsSignup";
import { faqItems, footer } from "../content/pilotLanding";
import { getPublicApiBase } from "../lib/publicApiBase";
import { dedupeProgramListingsByEvent } from "../lib/dedupeProgramListingsByEvent";
import { getDisciplineDisplay } from "../lib/disciplineLabels";
import {
  catalogQuery,
  dateRangeError,
  EMPTY_FILTERS,
  filterCatalog,
  FORMATS,
  parseCatalogFilters,
  SEASONS,
  type CatalogFilters,
  type CatalogProgram,
} from "../lib/catalog";
import { ruPluralNoun } from "../lib/ruPlural";
import { isCatalogProgram } from "../lib/catalog";
import { trackProductEvent } from "../lib/analytics/client";

const LEVELS: Record<string, string> = {
  beginner: "Начальный",
  intermediate: "Средний",
  advanced: "Продвинутый",
  expert: "Экспертный",
  all_levels: "Разные уровни — уточнить условия",
};

function HomePageInner() {
  const router = useRouter();
  const query = useSearchParams().toString();
  const filters = useMemo(() => parseCatalogFilters(query), [query]);
  const [draft, setDraft] = useState<CatalogFilters>(filters);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const filterPanel = useRef<HTMLDetailsElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => {
    void trackProductEvent("page_view", {
      page_type: "home",
      traffic_source: "homepage",
    });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let active = true;
    setLoading(true);
    setError(false);
    fetch(`${getPublicApiBase()}/programs`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog_unavailable");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCatalogProgram))
          throw new Error("invalid_catalog");
        if (active) setPrograms(data);
      })
      .catch(() => {
        if (active) {
          setPrograms([]);
          setError(true);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  const unique = useMemo(
    () => dedupeProgramListingsByEvent(programs),
    [programs],
  );
  const available = useMemo(
    () => filterCatalog(unique, EMPTY_FILTERS),
    [unique],
  );
  const results = useMemo(
    () => filterCatalog(unique, filters),
    [unique, filters],
  );
  const disciplines = useMemo(
    () =>
      [
        ...new Set([
          ...available.map((p) => {
            const d = getDisciplineDisplay(p.discipline);
            return d.translation || d.original;
          }),
          ...draft.disciplines.map(
            (d) => getDisciplineDisplay(d).translation || d,
          ),
        ]),
      ].sort((a, b) => a.localeCompare(b, "ru")),
    [available, draft.disciplines],
  );
  const regions = useMemo(
    () =>
      [...new Set(available.map((p) => p.region))].sort((a, b) =>
        a.localeCompare(b, "ru"),
      ),
    [available],
  );
  const rangeError = dateRangeError(draft);
  const hasFilters = catalogQuery(filters) !== "";
  const programQuery = new URLSearchParams(query);
  programQuery.set("returnTo", `/${query ? `?${query}` : ""}#programs`);
  function apply(next: CatalogFilters) {
    setDraft(next);
    const nextQuery = catalogQuery(next, query);
    router.replace(`/${nextQuery ? `?${nextQuery}` : ""}#programs`, {
      scroll: false,
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (rangeError) {
      document.getElementById("filter-to")?.focus();
      return;
    }
    apply(draft);
    if (filterPanel.current) filterPanel.current.open = false;
    resultHeading.current?.focus();
  }
  function toggle(key: "disciplines" | "levels", value: string) {
    const matches = (candidate: string) =>
      key === "disciplines"
        ? (
            getDisciplineDisplay(candidate).translation || candidate
          ).toLowerCase() === value.toLowerCase()
        : candidate === value;
    setDraft((current) => ({
      ...current,
      [key]: current[key].some(matches)
        ? current[key].filter((x) => !matches(x))
        : [...current[key], value],
    }));
  }
  const tags: { label: string; remove: () => void }[] = [
    ...filters.disciplines.map((d) => ({
      label: getDisciplineDisplay(d).translation || d,
      remove: () =>
        apply({
          ...filters,
          disciplines: filters.disciplines.filter((x) => x !== d),
        }),
    })),
    ...filters.levels.map((l) => ({
      label: LEVELS[l] || l,
      remove: () =>
        apply({ ...filters, levels: filters.levels.filter((x) => x !== l) }),
    })),
  ];
  for (const [key, label] of Object.entries({
    region: filters.region,
    from: filters.from ? `С ${filters.from}` : "",
    to: filters.to ? `По ${filters.to}` : "",
    season: SEASONS[filters.season] || filters.season,
    format: FORMATS[filters.format] || filters.format,
  })) {
    if (label)
      tags.push({ label, remove: () => apply({ ...filters, [key]: "" }) });
  }
  if (filters.nearest)
    tags.push({
      label: "Старт в ближайшие 14 дней",
      remove: () => apply({ ...filters, nearest: false }),
    });

  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section
          className="mw-discovery-hero mw-container"
          aria-labelledby="home-title"
        >
          <div>
            <p className="mw-hero-kicker">MyWaveTour · на вашей волне</p>
            <h1 id="home-title">
              Спортивные выезды
              <br />
              по России
            </h1>
            <p className="mw-lead">
              Выбирайте по уровню, датам и условиям участия. Найдите свой выезд
              — мы поможем уточнить детали с организатором.
            </p>
            <a href="#programs" className="mw-btn mw-btn--primary">
              Смотреть выезды
            </a>
            <p className="mw-form-note">
              Заявка без оплаты. Участие подтверждает организатор.
            </p>
          </div>
          <aside
            className="mw-discovery-promise"
            aria-label="Как выбрать выезд"
          >
            <p className="mw-hero-kicker">От интереса к участию</p>
            <h2>Сначала — понятные условия</h2>
            <ol>
              <li>
                <strong>Сравните программы</strong>
                <span>Даты, уровень и что входит в стоимость.</span>
              </li>
              <li>
                <strong>Задайте вопросы</strong>
                <span>Оставьте контакт и уточните важные детали.</span>
              </li>
              <li>
                <strong>Примите решение</strong>
                <span>После подтверждения мест и условий организатором.</span>
              </li>
            </ol>
          </aside>
        </section>

        <section
          id="programs"
          className="mw-container mw-catalog-section"
          aria-labelledby="catalog-title"
        >
          <span id="catalog-entries" className="mw-anchor" />
          <div className="mw-section-heading">
            <div>
              <p className="mw-hero-kicker">Выберите свой следующий шаг</p>
              <h2 id="catalog-title" className="mw-h2">
                Выезды и программы
              </h2>
            </div>
            {!loading && !error && (
              <p className="mw-form-note">
                {available.length}{" "}
                {ruPluralNoun(available.length, ["выезд", "выезда", "выездов"])}{" "}
                в каталоге
              </p>
            )}
          </div>
          <details ref={filterPanel} className="mw-catalog-filters">
            <summary>
              Фильтры{tags.length ? ` · ${tags.length}` : ""}
              <span>Вид спорта, регион, даты и уровень</span>
            </summary>
            <form onSubmit={submit}>
              <div className="mw-catalog-filter-grid">
                <fieldset>
                  <legend>Вид спорта</legend>
                  {disciplines.length ? (
                    disciplines.map((d) => (
                      <label className="mw-check" key={d}>
                        <input
                          type="checkbox"
                          checked={draft.disciplines.some(
                            (value) =>
                              (
                                getDisciplineDisplay(value).translation || value
                              ).toLowerCase() === d.toLowerCase(),
                          )}
                          onChange={() => toggle("disciplines", d)}
                        />
                        {d}
                      </label>
                    ))
                  ) : (
                    <p>Виды спорта появятся вместе с программами.</p>
                  )}
                </fieldset>
                <fieldset>
                  <legend>Уровень подготовки</legend>
                  {Object.entries(LEVELS).map(([value, label]) => (
                    <label className="mw-check" key={value}>
                      <input
                        type="checkbox"
                        checked={draft.levels.includes(value)}
                        onChange={() => toggle("levels", value)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <div className="mw-field">
                  <label htmlFor="filter-region">Регион или локация</label>
                  <input
                    id="filter-region"
                    className="mw-input"
                    list="catalog-regions"
                    value={draft.region}
                    onChange={(e) =>
                      setDraft({ ...draft, region: e.target.value })
                    }
                    placeholder="Например, Алтай"
                  />
                  <datalist id="catalog-regions">
                    {regions.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
                <div className="mw-field">
                  <label htmlFor="filter-format">Формат</label>
                  <select
                    id="filter-format"
                    className="mw-select"
                    value={draft.format}
                    onChange={(e) =>
                      setDraft({ ...draft, format: e.target.value })
                    }
                  >
                    <option value="">Все форматы</option>
                    {draft.format && !FORMATS[draft.format] && (
                      <option value={draft.format}>{draft.format}</option>
                    )}
                    {Object.entries(FORMATS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mw-field">
                  <label htmlFor="filter-from">Дата старта: с</label>
                  <input
                    id="filter-from"
                    className="mw-input"
                    type="date"
                    value={draft.from}
                    onChange={(e) =>
                      setDraft({ ...draft, from: e.target.value })
                    }
                  />
                </div>
                <div className="mw-field">
                  <label htmlFor="filter-to">Дата старта: по</label>
                  <input
                    id="filter-to"
                    className="mw-input"
                    type="date"
                    value={draft.to}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                    aria-invalid={Boolean(rangeError)}
                    aria-describedby={rangeError ? "date-error" : undefined}
                  />
                </div>
                <div className="mw-field" id="programs-season">
                  <label htmlFor="filter-season">Сезон старта</label>
                  <select
                    id="filter-season"
                    className="mw-select"
                    value={draft.season}
                    onChange={(e) =>
                      setDraft({ ...draft, season: e.target.value })
                    }
                  >
                    <option value="">Любой сезон</option>
                    {draft.season && !SEASONS[draft.season] && (
                      <option value={draft.season}>{draft.season}</option>
                    )}
                    {Object.entries(SEASONS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="mw-check">
                  <input
                    type="checkbox"
                    checked={draft.nearest}
                    onChange={(e) =>
                      setDraft({ ...draft, nearest: e.target.checked })
                    }
                  />
                  Старт в ближайшие 14 дней
                </label>
              </div>
              {rangeError && (
                <p id="date-error" className="mw-error" role="alert">
                  {rangeError}
                </p>
              )}
              <div className="mw-action-row">
                <button type="submit" className="mw-btn mw-btn--primary">
                  Показать выезды
                </button>
                <button
                  type="button"
                  className="mw-btn mw-btn--ghost"
                  onClick={() => setDraft(EMPTY_FILTERS)}
                >
                  Очистить поля
                </button>
                <button
                  type="button"
                  className="mw-link-button"
                  onClick={() => {
                    setDraft(filters);
                    if (filterPanel.current) {
                      filterPanel.current.open = false;
                      filterPanel.current.querySelector("summary")?.focus();
                    }
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          </details>
          {hasFilters && (
            <div className="mw-active-filters" aria-label="Активные фильтры">
              {tags.map((tag, i) => (
                <button
                  type="button"
                  className="mw-filter-tag"
                  key={`${tag.label}-${i}`}
                  onClick={tag.remove}
                  aria-label={`Убрать фильтр: ${tag.label}`}
                >
                  {tag.label}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              <button
                type="button"
                className="mw-link-button"
                onClick={() => apply(EMPTY_FILTERS)}
              >
                Сбросить всё
              </button>
            </div>
          )}
          <h3
            ref={resultHeading}
            tabIndex={-1}
            className="mw-result-count"
            aria-live="polite"
          >
            {loading
              ? "Загружаем выезды…"
              : error
                ? "Каталог временно недоступен"
                : `${results.length} ${ruPluralNoun(results.length, ["выезд найден", "выезда найдено", "выездов найдено"])}`}
          </h3>
          {loading ? (
            <div className="mw-catalog-skeleton" aria-hidden="true">
              <div />
              <div />
              <div />
            </div>
          ) : error ? (
            <div className="mw-empty-state" role="alert">
              <h3>Не удалось загрузить выезды</h3>
              <p>Попробуйте ещё раз. Ваши фильтры сохранены.</p>
              <button
                type="button"
                className="mw-btn mw-btn--primary"
                onClick={() => setAttempt((v) => v + 1)}
              >
                Повторить загрузку
              </button>
            </div>
          ) : results.length ? (
            <div className="program-grid">
              {results.map((p) => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  levelLabel={getProgramLevelLabel(p.levelRequired)}
                  programHrefQuery={programQuery.toString()}
                />
              ))}
            </div>
          ) : (
            <div className="mw-empty-state">
              <h3>
                {hasFilters
                  ? "По вашим условиям выездов пока нет"
                  : "Новые выезды готовятся"}
              </h3>
              <p>
                {dateRangeError(filters) ||
                  (hasFilters
                    ? "Попробуйте другой регион, даты или уровень. Мы показываем только подходящие программы."
                    : "Когда программы появятся, здесь будут их даты и условия участия.")}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  className="mw-btn mw-btn--primary"
                  onClick={() => apply(EMPTY_FILTERS)}
                >
                  Посмотреть все выезды
                </button>
              )}
            </div>
          )}
          <details className="mw-updates-details">
            <summary>Сообщать мне о новых выездах</summary>
            <StartAlertsSignup
              discipline={filters.disciplines.join(", ") || undefined}
              region={filters.region || undefined}
            />
          </details>
        </section>

        <section
          id="role-traveler"
          className="mw-container mw-section"
          aria-labelledby="how-title"
        >
          <h2 id="how-title" className="mw-h2">
            Как проходит заявка
          </h2>
          <div className="mw-role-path-grid">
            <div className="mw-role-path-card">
              <h3>1. Вы выбираете</h3>
              <p>
                Сравниваете требования к участию, даты и стоимость. Неизвестные
                условия можно уточнить в заявке.
              </p>
            </div>
            <div className="mw-role-path-card">
              <h3>2. Мы уточняем</h3>
              <p>
                Команда MyWaveTour принимает обращение и помогает связаться с
                организатором.
              </p>
            </div>
            <div className="mw-role-path-card">
              <h3>3. Вы решаете</h3>
              <p>
                Места, итоговую стоимость и порядок участия подтверждает
                организатор. Заявка ещё не означает бронирование.
              </p>
            </div>
          </div>
        </section>
        <section
          id="organizers"
          className="mw-container mw-section mw-organizer-invite"
        >
          <span id="role-organizer" className="mw-anchor" />
          <div>
            <p className="mw-hero-kicker">Для команд и организаторов</p>
            <h2 className="mw-h2">Проводите спортивные выезды?</h2>
            <p>
              Отправьте программу на рассмотрение. Команда поможет уточнить
              сведения перед публикацией.
            </p>
          </div>
          <div className="mw-action-row">
            <Link href="/organizers/program" className="mw-btn mw-btn--primary">
              Предложить программу
            </Link>
            <Link
              href="/organizers/verification"
              className="mw-btn mw-btn--ghost"
            >
              Как проходит проверка
            </Link>
          </div>
        </section>
        <section id="faq" className="mw-container mw-section">
          <span id="reviews-note" className="mw-anchor" />
          <h2 className="mw-h2">Вопросы и ответы</h2>
          <Faq items={faqItems} />
        </section>
      </main>
      <LandingFooter
        brand={footer.brand}
        tagline={footer.tagline}
        links={footer.links}
      />
    </>
  );
}

export function HomePage() {
  return (
    <Suspense
      fallback={
        <>
          <SiteHeader />
          <main id="main-content" className="mw-container mw-section">
            <h1 className="mw-h1">Спортивные выезды по России</h1>
            <p role="status">Загружаем каталог…</p>
          </main>
        </>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}
