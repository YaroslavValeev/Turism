"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type HotOfferSlide = {
  id: string;
  title: string;
  href: string;
  imageSrc: string;
  kicker: string;
  timingLabel: string;
  metaLabel: string;
  priceLabel: string | null;
  spotsLabel: string | null;
  isStarred: boolean;
};

type Props = {
  slides: HotOfferSlide[];
};

export function HeroHotOfferSpotlight({ slides }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  if (slides.length === 0) {
    return (
      <aside className="mw-hot-offer" aria-label="Горячее предложение">
        <div className="mw-hot-offer__header">
          <p className="mw-hot-offer__eyebrow">Горячее предложение</p>
        </div>
        <div className="mw-hot-offer__empty">
          <p className="mw-hot-offer__empty-title">Сейчас готовим следующую витрину</p>
          <p className="mw-hot-offer__empty-text">
            Как только программа будет отмечена звёздочкой и откроется к заявкам, она появится здесь автоматически.
          </p>
          <a href="#programs" className="mw-btn mw-btn--primary">
            Найти свой выезд
          </a>
        </div>
      </aside>
    );
  }

  const active = slides[activeIndex];
  const canRotate = slides.length > 1;

  return (
    <aside
      className="mw-hot-offer"
      aria-label="Горячее предложение"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="mw-hot-offer__header">
        <div>
          <p className="mw-hot-offer__eyebrow">Горячее предложение</p>
          <p className="mw-hot-offer__timing">{active.timingLabel}</p>
        </div>
        {active.isStarred && <span className="mw-hot-offer__badge">⭐ витрина</span>}
      </div>

      <div className="mw-hot-offer__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.imageSrc} alt="" className="mw-hot-offer__img" />
      </div>

      <div className="mw-hot-offer__body">
        <p className="mw-hot-offer__kicker">{active.kicker}</p>
        <h2 className="mw-hot-offer__title">{active.title}</h2>
        <p className="mw-hot-offer__meta">{active.metaLabel}</p>
        <div className="mw-hot-offer__facts">
          {active.priceLabel && <span className="mw-hot-offer__fact">{active.priceLabel}</span>}
          {active.spotsLabel && <span className="mw-hot-offer__fact">{active.spotsLabel}</span>}
        </div>
      </div>

      <div className="mw-hot-offer__footer">
        <Link href={active.href} className="mw-btn mw-btn--primary">
          Подробнее
        </Link>
        {canRotate && (
          <div className="mw-hot-offer__controls">
            <button
              type="button"
              className="mw-hot-offer__arrow"
              aria-label="Предыдущее горячее предложение"
              onClick={() => setActiveIndex((current) => (current - 1 + slides.length) % slides.length)}
            >
              ‹
            </button>
            <div className="mw-hot-offer__dots" role="tablist" aria-label="Горячие предложения">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  className={`mw-hot-offer__dot ${index === activeIndex ? "mw-hot-offer__dot--active" : ""}`}
                  aria-label={`Предложение ${index + 1}: ${slide.title}`}
                  aria-current={index === activeIndex}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
            <button
              type="button"
              className="mw-hot-offer__arrow"
              aria-label="Следующее горячее предложение"
              onClick={() => setActiveIndex((current) => (current + 1) % slides.length)}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
