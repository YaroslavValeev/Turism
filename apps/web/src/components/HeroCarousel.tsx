"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CarouselSlide } from "../content/pilotLanding";

const INTERVAL_MS = 6000;

type Props = {
  slides: CarouselSlide[];
};

export function HeroCarousel({ slides }: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (index: number) => {
      const i = ((index % slides.length) + slides.length) % slides.length;
      setActive(i);
      const el = trackRef.current;
      if (el) {
        el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
      }
    },
    [slides.length]
  );

  const prev = useCallback(() => goTo(active - 1), [active, goTo]);
  const next = useCallback(() => goTo(active + 1), [active, goTo]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = window.setInterval(() => {
      setActive((a) => {
        const nextIdx = (a + 1) % slides.length;
        const el = trackRef.current;
        if (el) el.scrollTo({ left: nextIdx * el.clientWidth, behavior: "smooth" });
        return nextIdx;
      });
    }, INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [paused, slides.length]);

  return (
    <div
      className="mw-adventure"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.length > 1 && (
        <div className="mw-adventure__arrows">
          <button type="button" className="mw-btn mw-btn--nav" onClick={prev} aria-label="Предыдущий слайд">
            ‹
          </button>
          <button type="button" className="mw-btn mw-btn--nav" onClick={next} aria-label="Следующий слайд">
            ›
          </button>
        </div>
      )}
      <div className="mw-adventure__track" ref={trackRef}>
        {slides.map((s) => (
          <div
            key={s.id}
            className={`mw-adventure__slide mw-adventure__slide--${s.variant}`}
            aria-hidden={slides[active]?.id !== s.id}
          >
            <div className="mw-adventure__slide-bg" />
            <div className="mw-adventure__overlay">
              <div className="mw-adventure__overlay-inner">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <span className={`mw-badge ${s.status === "pilot" ? "mw-badge--pilot" : "mw-badge--soon"}`}>
                    {s.status === "pilot" ? "Доступно" : "Скоро"}
                  </span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <a href={s.ctaHref} className="mw-btn mw-btn--primary">
                  {s.ctaLabel}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mw-adventure__dots" role="tablist" aria-label="Слайды направлений">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`mw-adventure__dot ${i === active ? "mw-adventure__dot--active" : ""}`}
            aria-label={`Слайд ${i + 1}`}
            aria-current={i === active}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}
