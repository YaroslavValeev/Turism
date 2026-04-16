"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type SiteRole = "traveler" | "organizer";

type Props = {
  role: SiteRole;
  onRoleChange: (role: SiteRole) => void;
  appliedDiscipline: string;
  appliedCountry: string;
  disciplineOptions: string[];
  countryOptions: string[];
  onApplyFilters: (discipline: string, country: string) => void;
  onResetFilters: () => void;
};

export function SiteHeader({
  role,
  onRoleChange,
  appliedDiscipline,
  appliedCountry,
  disciplineOptions,
  countryOptions,
  onApplyFilters,
  onResetFilters,
}: Props) {
  const [draftDiscipline, setDraftDiscipline] = useState(appliedDiscipline);
  const [draftCountry, setDraftCountry] = useState(appliedCountry);

  useEffect(() => {
    setDraftDiscipline(appliedDiscipline);
    setDraftCountry(appliedCountry);
  }, [appliedDiscipline, appliedCountry]);

  const filtersDirty = useMemo(
    () => draftDiscipline !== appliedDiscipline || draftCountry !== appliedCountry,
    [draftDiscipline, draftCountry, appliedDiscipline, appliedCountry],
  );

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
          aria-label="MyWave Travel — на главную"
          title="На главную"
        >
          MyWave Travel
        </Link>

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
          <p className="mw-site-header__role-hint">Выберите роль — страница прокрутится к шагам ниже.</p>
        </div>

        <div className="mw-site-header__filters">
          <div className="mw-site-header__filters-grid">
            <div className="mw-site-header__field mw-site-header__field--filter-col">
              <label htmlFor="hdr-discipline">Дисциплина</label>
              <input
                id="hdr-discipline"
                list="hdr-discipline-options"
                className="mw-input mw-site-header__select"
                value={draftDiscipline}
                onChange={(e) => setDraftDiscipline(e.target.value)}
                placeholder="Начните вводить дисциплину"
                autoComplete="off"
              />
              <datalist id="hdr-discipline-options">
                {disciplineOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <button
                type="button"
                className={`mw-btn mw-site-header__apply ${filtersDirty ? "mw-btn--primary" : "mw-btn--ghost"}`}
                disabled={!filtersDirty}
                onClick={() => onApplyFilters(draftDiscipline, draftCountry)}
              >
                Применить фильтр
              </button>
            </div>
            <div className="mw-site-header__field mw-site-header__field--filter-col">
              <label htmlFor="hdr-country">Направление</label>
              <input
                id="hdr-country"
                list="hdr-country-options"
                className="mw-input mw-site-header__select"
                value={draftCountry}
                onChange={(e) => setDraftCountry(e.target.value)}
                placeholder="Укажите страну"
                autoComplete="off"
              />
              <datalist id="hdr-country-options">
                {countryOptions.map((option) => (
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
