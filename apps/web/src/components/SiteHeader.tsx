"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { homePrimaryNav } from "../content/pilotLanding";
import { HoverHint } from "./HoverHint";

export type SiteRole = "traveler" | "organizer";

function parseDisciplineInput(raw: string): string[] {
  return raw
    .split(/[,;]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Props = {
  role: SiteRole;
  onRoleChange: (role: SiteRole) => void;
  /** Одна и несколько дисциплин; в шапке вводятся через запятую. */
  appliedDisciplines: string[];
  /** Подстрока региона / локации в России (фильтр каталога). */
  appliedRegionFilter: string;
  disciplineOptions: string[];
  regionFilterOptions: string[];
  onApplyFilters: (disciplines: string[], regionFilter: string) => void;
  onResetFilters: () => void;
};

export function SiteHeader({
  role,
  onRoleChange,
  appliedDisciplines,
  appliedRegionFilter,
  disciplineOptions,
  regionFilterOptions,
  onApplyFilters,
  onResetFilters,
}: Props) {
  const [draftDiscipline, setDraftDiscipline] = useState(() => appliedDisciplines.join(", "));
  const [draftRegionFilter, setDraftRegionFilter] = useState(appliedRegionFilter);

  useEffect(() => {
    setDraftDiscipline(appliedDisciplines.join(", "));
    setDraftRegionFilter(appliedRegionFilter);
  }, [appliedDisciplines, appliedRegionFilter]);

  const filtersDirty = useMemo(() => {
    const draftList = parseDisciplineInput(draftDiscipline);
    const a = [...appliedDisciplines].map((s) => s.trim()).filter(Boolean).sort();
    const b = [...draftList].sort();
    if (a.length !== b.length) return true;
    return a.some((s, i) => s !== b[i]);
  }, [draftDiscipline, appliedDisciplines]);

  const regionDirty = draftRegionFilter !== appliedRegionFilter;
  const filtersDirtyResolved = filtersDirty || regionDirty;

  const headerRef = useRef<HTMLElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [atPageTop, setAtPageTop] = useState(true);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSpacerHeight(el.offsetHeight));
    ro.observe(el);
    setSpacerHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [role]);

  useEffect(() => {
    const TOP_PX = 8;
    const onScroll = () => {
      const y = window.scrollY ?? document.documentElement.scrollTop;
      setAtPageTop(y <= TOP_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className={`mw-site-header mw-site-header--premium ${atPageTop ? "" : "mw-site-header--scroll-hidden"}`}
      >
        <div className="mw-site-header__inner">
          <Link
            href="/"
            className="mw-site-header__brand"
            aria-label="MyWaveTour — на главную"
            title="На главную"
          >
            <Image
              src="/brand/mywavetour-logo-human.png"
              alt="MyWaveTour"
              width={1881}
              height={836}
              priority
              sizes="(max-width: 640px) 220px, (max-width: 1024px) 290px, 360px"
              className="mw-site-header__brand-image"
            />
          </Link>

          <nav className="mw-site-header__nav" aria-label="Разделы витрины">
            <span className="mw-site-header__nav-hint" aria-hidden="true">Разделы →</span>
            {homePrimaryNav.map((item) => (
              <Link key={item.href + item.label} href={item.href} className="mw-site-header__nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mw-site-header__controls">
            <div className="mw-site-header__role-block">
              <span className="mw-site-header__role-legend" id="hdr-role-legend">
                Я здесь как
              </span>
              <div className="mw-site-header__role" role="group" aria-labelledby="hdr-role-legend">
                <button
                  type="button"
                  className={`mw-site-header__role-btn ${role === "traveler" ? "mw-site-header__role-btn--active" : ""}`}
                  onClick={() => onRoleChange("traveler")}
                  aria-pressed={role === "traveler"}
                >
                  <span className="mw-site-header__role-title">Искатель приключений</span>
                  <span className="mw-site-header__role-sub">программы и заявки</span>
                </button>
                <button
                  type="button"
                  className={`mw-site-header__role-btn ${role === "organizer" ? "mw-site-header__role-btn--active" : ""}`}
                  onClick={() => onRoleChange("organizer")}
                  aria-pressed={role === "organizer"}
                >
                  <span className="mw-site-header__role-title">Организатор кэмпа</span>
                  <span className="mw-site-header__role-sub">публикация и заявки</span>
                </button>
              </div>
              <p className="mw-site-header__role-hint">
                <HoverHint hint="Страница прокрутится к шагам ниже." className="mw-site-header__role-hint-tooltip">
                  Выберите роль
                </HoverHint>
              </p>
            </div>

            <div className="mw-site-header__filters">
              <div className="mw-site-header__filters-grid">
                <div className="mw-site-header__field mw-site-header__field--filter-col">
                  <label htmlFor="hdr-discipline">Дисциплины</label>
                  <input
                    id="hdr-discipline"
                    list="hdr-discipline-options"
                    className="mw-input mw-site-header__select"
                    value={draftDiscipline}
                    onChange={(e) => setDraftDiscipline(e.target.value)}
                    placeholder="Например: вейксерф, кайт — через запятую"
                    autoComplete="off"
                  />
                  <datalist id="hdr-discipline-options">
                    {disciplineOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    className={`mw-btn mw-site-header__apply ${filtersDirtyResolved ? "mw-btn--primary" : "mw-btn--ghost"}`}
                    disabled={!filtersDirtyResolved}
                    onClick={() => onApplyFilters(parseDisciplineInput(draftDiscipline), draftRegionFilter)}
                  >
                    Применить фильтр
                  </button>
                </div>
                <div className="mw-site-header__field mw-site-header__field--filter-col">
                  <label htmlFor="hdr-region">Регион России</label>
                  <input
                    id="hdr-region"
                    list="hdr-region-options"
                    className="mw-input mw-site-header__select"
                    value={draftRegionFilter}
                    onChange={(e) => setDraftRegionFilter(e.target.value)}
                    placeholder="Например: Кавказ, Сочи, Алтай"
                    autoComplete="off"
                  />
                  <datalist id="hdr-region-options">
                    {regionFilterOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <button type="button" className="mw-btn mw-btn--ghost mw-site-header__reset" onClick={onResetFilters}>
                    Сбросить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {role === "organizer" && (
          <div className="mw-site-header__banner">
            <div className="mw-site-header__banner-inner">
              <span>
                Режим организатора: оформите заявку на публикацию или запрос по верификации.{" "}
                <Link href="/organizers/program">Подать программу</Link>
                {" · "}
                <Link href="/organizers/verification">Про верификацию</Link>
              </span>
            </div>
          </div>
        )}
      </header>
      <div className="mw-site-header-spacer" style={{ height: spacerHeight }} aria-hidden="true" />
    </>
  );
}
