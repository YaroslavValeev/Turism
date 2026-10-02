"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDate } from "../../lib/catalog";
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
import { dedupeProgramListingsByEvent } from "../../lib/dedupeProgramListingsByEvent";
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

type ApiProgram = Parameters<typeof dedupeProgramListingsByEvent>[0][number] & { scheduleType?: string | null };

const STARTS_FORMS = ["старт", "старта", "стартов"] as const;

function haptic() {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) tg.HapticFeedback?.selectionChanged();
}

export function DateSearch() {
  const router = useRouter();
  const today = useMemo(() => localDate(), []);
  const [programs, setPrograms] = useState<ApiProgram[] | null>(null);
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
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
    let cancelled = false;
    fetch(`${getPublicApiBase()}/programs`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setPrograms(Array.isArray(data) ? dedupeProgramListingsByEvent(data as ApiProgram[]) : []);
      })
      .catch(() => {
        if (!cancelled) setPrograms([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byDay = useMemo(() => startsByDay(programs ?? [], today), [programs, today]);
  const selected = effectiveRange(range);
  const count = countInRange(byDay, selected);
  const nextStart = selected && count === 0 ? nextStartAfter(byDay, selected.to) : null;
  const weeks = monthGrid(cursor.year, cursor.month);
  const now = new Date();
  const atCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();

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
    const key = startPreset ?? new URLSearchParams(window.location.search).get("preset");
    const preset = PRESETS.find((p) => p.key === key);
    if (preset) applyRange(preset.range(), preset.key);
  }, [startPreset, applyRange]);

  const onDay = (day: string) => {
    setRange((prev) => pickDay(prev, day));
    setPresetKey(null);
    haptic();
  };

  const goToCatalog = useCallback(() => {
    if (!selected) return;
    const params = new URLSearchParams();
    const preset = PRESETS.find((p) => p.key === presetKey);
    if (count === 0) {
      params.set("from", selected.from);
    } else if (preset?.when) {
      params.set("when", preset.when);
    } else {
      params.set("from", selected.from);
      params.set("to", selected.to);
    }
    const current = new URLSearchParams(window.location.search);
    for (const [key, value] of current) if (key.startsWith("utm_")) params.set(key, value);
    router.push(`/?${params.toString()}#programs`);
  }, [router, selected, presetKey, count]);

  const cta = !selected
    ? "Выберите даты"
    : programs === null
      ? "Считаем старты…"
      : count > 0
        ? `Показать ${count} ${ruPluralNoun(count, STARTS_FORMS)}`
        : "Показать ближайшие старты";

  const goRef = useRef(goToCatalog);
  goRef.current = goToCatalog;
  useEffect(() => {
    if (!telegram) return;
    const handler = () => goRef.current();
    telegram.MainButton.onClick(handler);
    return () => telegram.MainButton.offClick(handler);
  }, [telegram]);
  useEffect(() => {
    if (!telegram) return;
    telegram.MainButton.setText(cta);
    if (selected) {
      telegram.MainButton.enable();
      telegram.MainButton.show();
    } else {
      telegram.MainButton.hide();
    }
  }, [telegram, cta, selected]);

  return (
    <main className="mw-dates">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={attachTelegram} />
      <a className="mw-dates__brand" href="/" aria-label="MyWaveTour — на главную">
        <img src="/brand/mywavetour-logo-human.png" alt="MyWaveTour" width={220} height={97} />
      </a>
      <h1 className="mw-dates__title">Когда едем?</h1>
      <p className="mw-dates__lead">Выберите даты — покажем программы, которые стартуют в эти дни.</p>

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

      <div className={`mw-dates__footer${telegram ? " is-telegram" : ""}`}>
        <p className="mw-dates__summary" aria-live="polite">
          {!selected
            ? "Нажмите на день начала, затем на день окончания."
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
          <button type="button" className="mw-btn mw-btn--primary mw-dates__cta" disabled={!selected} onClick={goToCatalog}>
            {cta}
          </button>
        ) : null}
      </div>
    </main>
  );
}
