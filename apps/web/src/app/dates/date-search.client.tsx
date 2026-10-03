"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDate, type CatalogProgram } from "../../lib/catalog";
import { MINI_LEVELS, miniCatalogQuery, miniEntry, miniPrograms, readMiniCatalog } from "../../lib/miniCatalog";
import { getDisciplineDisplay } from "../../lib/disciplineLabels";
import { formatProgramPrice } from "../../lib/priceFormat";
import { applyProgramCardImageFallback, normalizeProgramCardCoverSrc, pickBestProgramCoverImageUrl } from "../../lib/programCardCover";
import {
  MONTHS_NOMINATIVE,
  WEEKDAYS_SHORT,
  addDaysYmd,
  countInRange,
  effectiveRange,
  formatDay,
  formatRange,
  monthGrid,
  nextStartAfter,
  pickDay,
  startsByDay,
  type DateRange,
} from "../../lib/dateSearch";
import { getPublicApiBase } from "../../lib/publicApiBase";
import { ruPluralNoun } from "../../lib/ruPlural";
import { WEEKEND_PRESET_TITLES, weekendRange, type WeekendPreset } from "../../lib/weekendRange";

type TelegramMainButton = {
  setText(text: string): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
};
type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  MainButton: TelegramMainButton;
  HapticFeedback?: { selectionChanged(): void };
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type Preset = { key: string; title: string; range: () => DateRange; when?: WeekendPreset };

const PRESETS: Preset[] = [
  ...(["this-weekend", "next-weekend"] as WeekendPreset[]).map((when) => ({
    key: when,
    title: WEEKEND_PRESET_TITLES[when],
    when,
    range: () => {
      const r = weekendRange(when);
      return { from: r.from, to: r.to };
    },
  })),
  { key: "2w", title: "2 недели", range: () => ({ from: localDate(), to: addDaysYmd(localDate(), 13) }) },
  { key: "month", title: "Месяц", range: () => ({ from: localDate(), to: addDaysYmd(localDate(), 30) }) },
];

const STARTS_FORMS = ["старт", "старта", "стартов"] as const;

function haptic() {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) tg.HapticFeedback?.selectionChanged();
}

export function DateSearch() {
  // Date-dependent markup is rendered after mounting: server and Telegram may use different timezones.
  const [today, setToday] = useState("");
  const [programs, setPrograms] = useState<CatalogProgram[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [discipline, setDiscipline] = useState("");
  const [level, setLevel] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const resultsRef = useRef<HTMLElement>(null);
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ year: 2000, month: 0 });
  const [telegram, setTelegram] = useState<TelegramWebApp | null>(null);

  // Вне Telegram скрипт тоже грузится, но initData пустая — тогда остаёмся обычной страницей.
  const attachTelegram = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return;
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#ffffff");
    tg.setBackgroundColor?.("#f5f5f4");
    setTelegram(tg);
  }, []);
  useEffect(attachTelegram, [attachTelegram]);

  useEffect(() => {
    const now = new Date();
    setToday(localDate(now));
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    const entry = miniEntry(window.location.search, window.location.hash);
    setDiscipline(entry.discipline);
    setLevel(entry.level);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setPrograms(null);
    setLoadError(false);
    fetch(`${getPublicApiBase()}/programs`, { cache: "no-store", signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setPrograms(readMiniCatalog(data));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [reloadKey]);

  const matching = useMemo(() => miniPrograms(programs ?? [], null, discipline, level, today), [programs, discipline, level, today]);
  const byDay = useMemo(() => startsByDay(matching, today), [matching, today]);
  const selected = effectiveRange(range);
  const results = miniPrograms(matching, selected, "", "", today);
  const disciplines = [...new Set((programs ?? []).map((p) => p.discipline))].sort();
  if (discipline && !disciplines.includes(discipline)) disciplines.push(discipline);
  useEffect(() => setVisibleCount(6), [range.from, range.to, discipline, level]);
  const count = countInRange(byDay, selected);
  const nextStart = selected && count === 0 ? nextStartAfter(byDay, selected.to) : null;
  const weeks = monthGrid(cursor.year, cursor.month);
  const atCurrentMonth = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}` <= today.slice(0, 7);

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const applyRange = useCallback((next: DateRange, key: string | null) => {
    setRange(next);
    setPresetKey(key);
    const [y, m] = next.from.split("-").map(Number) as [number, number];
    setCursor({ year: y, month: m - 1 });
    haptic();
  }, []);

  const startPreset = telegram?.initDataUnsafe?.start_param;
  useEffect(() => {
    const entry = miniEntry(window.location.search, window.location.hash, startPreset);
    const preset = PRESETS.find((p) => p.key === entry.preset);
    if (preset) applyRange(preset.range(), preset.key);
    else if (entry.range) applyRange(entry.range, null);
  }, [startPreset, applyRange]);

  const onDay = (day: string) => {
    setRange((prev) => pickDay(prev, day));
    setPresetKey(null);
    haptic();
  };

  const showResults = useCallback(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const [catalogHref, setCatalogHref] = useState("/#programs");
  useEffect(() => {
    setCatalogHref(`/?${miniCatalogQuery(selected, discipline, level, window.location.search)}#programs`);
  }, [range.from, range.to, discipline, level]);

  const cta = !selected
    ? "Выберите даты"
    : loadError
      ? "Каталог недоступен"
      : programs === null
      ? "Считаем старты…"
      : count > 0
        ? `Показать ${count} ${ruPluralNoun(count, STARTS_FORMS)}`
        : "Посмотреть результаты";

  const goRef = useRef(showResults);
  goRef.current = showResults;
  useEffect(() => {
    if (!telegram) return;
    const handler = () => goRef.current();
    telegram.MainButton.onClick(handler);
    return () => telegram.MainButton.offClick(handler);
  }, [telegram]);
  useEffect(() => {
    if (!telegram) return;
    telegram.MainButton.setText(cta);
    if (selected && programs !== null && !loadError) {
      telegram.MainButton.enable();
      telegram.MainButton.show();
    } else {
      telegram.MainButton.hide();
    }
  }, [telegram, cta, selected, programs, loadError]);
  useEffect(() => () => telegram?.MainButton.hide(), [telegram]);

  return (
    <main className="mw-dates">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={attachTelegram} />
      <a className="mw-dates__brand" href="/" aria-label="MyWaveTour — на главную">
        <img src="/brand/mywavetour-logo-human.png" alt="MyWaveTour" width={220} height={97} />
      </a>
      <h1 className="mw-dates__title">Когда едем?</h1>
      <p className="mw-dates__lead">Выберите даты, дисциплину и уровень — поездки появятся здесь, без перехода в другой каталог.</p>

      <section className="mw-dates__filters" aria-label="Фильтры поездок">
        <label>Дисциплина
          <select className="mw-input" value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            <option value="">Все дисциплины</option>
            {disciplines.map((d) => <option key={d} value={d}>{getDisciplineDisplay(d).translation || d}</option>)}
          </select>
        </label>
        <label>Уровень
          <select className="mw-input" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Любой уровень</option>
            {MINI_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        {(discipline || level) && <button type="button" className="mw-dates__link" onClick={() => { setDiscipline(""); setLevel(""); }}>Сбросить фильтры</button>}
      </section>

      {today ? <>
      <div className="mw-dates__presets" role="group" aria-label="Быстрый выбор">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`mw-dates__chip${presetKey === p.key ? " is-active" : ""}`}
            aria-pressed={presetKey === p.key}
            onClick={() => applyRange(p.range(), p.key)}
          >
            {p.title}
            {p.when ? <span className="mw-dates__chip-sub">{weekendRange(p.when).label}</span> : null}
          </button>
        ))}
      </div>

      <section className="mw-dates__calendar" aria-label="Календарь">
        <div className="mw-dates__nav">
          <button type="button" onClick={() => shiftMonth(-1)} disabled={atCurrentMonth} aria-label="Предыдущий месяц">
            ‹
          </button>
          <span>
            {MONTHS_NOMINATIVE[cursor.month]} {cursor.year}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
            ›
          </button>
        </div>
        <div className="mw-dates__grid" role="grid">
          {WEEKDAYS_SHORT.map((w, i) => (
            <span key={w} className={`mw-dates__weekday${i >= 4 ? " is-weekend" : ""}`} role="columnheader">
              {w}
            </span>
          ))}
          {weeks.flat().map((cell) => {
            const past = cell.date < today;
            const inRange = selected && cell.date >= selected.from && cell.date <= selected.to;
            const edge = selected && (cell.date === selected.from || cell.date === selected.to);
            const starts = byDay.get(cell.date) ?? 0;
            const cls = [
              "mw-dates__day",
              cell.inMonth ? "" : "is-outside",
              inRange ? "is-in-range" : "",
              edge ? "is-edge" : "",
              cell.date === today ? "is-today" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={cell.date}
                type="button"
                className={cls}
                disabled={past}
                onClick={() => onDay(cell.date)}
                aria-label={`${formatDay(cell.date)}${starts ? `, стартов: ${starts}` : ""}`}
                aria-pressed={Boolean(inRange)}
              >
                {cell.day}
                {starts > 0 && !past ? <span className="mw-dates__dot" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
        <p className="mw-dates__legend">
          <span className="mw-dates__dot" aria-hidden /> есть старты
        </p>
      </section>

      </> : <p role="status">Готовим календарь…</p>}

      <section ref={resultsRef} className="mw-dates__results" aria-label="Поездки" aria-busy={programs === null && !loadError}>
        <h2>{selected ? `Поездки: ${formatRange(selected)}` : "Ближайшие поездки"}</h2>
        {loadError ? <div role="alert"><p>Не удалось загрузить каталог. Это не означает, что поездок нет.</p><button type="button" className="mw-btn" onClick={() => setReloadKey((n) => n + 1)}>Повторить загрузку</button></div>
          : programs === null ? <p role="status">Загружаем поездки…</p>
          : <>
            <p role="status">Найдено поездок: {results.length}</p>
            {results.length === 0 && <p>Нет поездок с подтверждёнными датами по этим условиям. Попробуйте другие даты или сбросьте фильтры. Программы «по запросу» доступны в полном каталоге.</p>}
            {results.slice(0, visibleCount).map((p) => {
              const cover = pickBestProgramCoverImageUrl(p.media, p.title, { mediaOrderPinned: p.mediaOrderPinned });
              return <article key={p.id} className="mw-dates__trip">
                {cover && <img src={normalizeProgramCardCoverSrc(cover)} alt={p.title} loading="lazy" onError={(e) => applyProgramCardImageFallback(e.currentTarget)} />}
                <h3><a href={`/program/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer">{p.title}</a></h3>
                <p>{getDisciplineDisplay(p.discipline).translation || p.discipline} · {p.region}</p>
                <p>{formatDay(p.startDate.slice(0, 10))} · {p.durationDays} дн. · {MINI_LEVELS.find((l) => l.value === p.levelRequired)?.label || "Уровень уточняется"}</p>
                <p>{formatProgramPrice(p) || "Стоимость уточняется"}</p>
                <a href={`/program/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer">Подробнее и заявка на сайте ↗</a>
              </article>;
            })}
            {visibleCount < results.length && <button type="button" className="mw-btn" onClick={() => setVisibleCount((n) => n + 6)}>Показать ещё ({results.length - visibleCount})</button>}
          </>}
        <a href={catalogHref} target="_blank" rel="noopener noreferrer">Полный каталог на сайте ↗</a>
        <p className="mw-dates__lead">Форма общей подписки находится в полном каталоге. Уведомления по выбранным датам и уровню пока не подключены.</p>
      </section>

      <div className={`mw-dates__footer${telegram ? " is-telegram" : ""}`}>
        <p className="mw-dates__summary" aria-live="polite">
          {!selected
            ? "Нажмите на день начала, затем на день окончания."
            : loadError ? "Каталог временно недоступен — повторите загрузку."
            : programs === null ? "Загружаем поездки…"
            : count > 0
              ? `${formatRange(selected)}: ${count} ${ruPluralNoun(count, STARTS_FORMS)}`
              : nextStart
                ? `${formatRange(selected)}: стартов нет. Ближайший — ${formatDay(nextStart)}.`
                : `${formatRange(selected)}: стартов пока нет.`}
        </p>
        {nextStart ? (
          <button type="button" className="mw-dates__link" onClick={() => applyRange({ from: nextStart, to: nextStart }, null)}>
            Перейти к {formatDay(nextStart)}
          </button>
        ) : null}
        {!telegram ? (
          <button type="button" className="mw-btn mw-btn--primary mw-dates__cta" disabled={!selected || programs === null || loadError} onClick={showResults}>
            {cta}
          </button>
        ) : null}
      </div>
    </main>
  );
}
