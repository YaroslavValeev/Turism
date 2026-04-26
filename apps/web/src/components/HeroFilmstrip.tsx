"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FilmstripFrame } from "../content/filmstripHero";

type Props = {
  frames: FilmstripFrame[];
  footnote?: string;
  hideIntro?: boolean;
  /** Зацикленная лента: тройной набор кадров, без «обрыва» на краях */
  loop?: boolean;
};

const AUTO_SCROLL_INTERVAL_MS = 3600;
const AUTO_RESUME_DELAY_MS = 10_000;
const WHEEL_SCROLL_FACTOR = 1.05;

export function HeroFilmstrip({ frames, footnote, hideIntro, loop = true }: Props) {
  const n = frames.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const skipScrollSync = useRef(false);
  const [logicalActive, setLogicalActive] = useState(0);
  const [linearActive, setLinearActive] = useState(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const resumeTimerRef = useRef<number | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  const pendingWheelDeltaRef = useRef(0);

  const pauseAutoTemporarily = useCallback(() => {
    setAutoPaused(true);
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      setAutoPaused(false);
    }, AUTO_RESUME_DELAY_MS);
  }, []);

  const extendedFrames = useMemo(() => {
    if (!loop || n === 0) return frames.map((f, i) => ({ frame: f, key: `${f.id}-s-${i}` }));
    return [...frames, ...frames, ...frames].map((f, i) => ({
      frame: f,
      key: `${f.id}-loop-${i}`,
    }));
  }, [frames, loop, n]);

  const scrollToLogical = useCallback(
    (logical: number, behavior: ScrollBehavior = "smooth") => {
      if (!loop || n === 0) return;
      const i = ((logical % n) + n) % n;
      const track = trackRef.current;
      const extIdx = i + n;
      const cell = track?.children[extIdx] as HTMLElement | undefined;
      if (track && cell) {
        skipScrollSync.current = true;
        const left = cell.offsetLeft;
        track.scrollTo({ left: Math.max(0, left), behavior });
        setLogicalActive(i);
        window.setTimeout(
          () => {
            skipScrollSync.current = false;
          },
          behavior === "auto" ? 50 : 450,
        );
      }
    },
    [loop, n],
  );

  useLayoutEffect(() => {
    if (!loop || n === 0) return;
    scrollToLogical(0, "auto");
  }, [loop, n, scrollToLogical]);

  const syncLoopPosition = useCallback(() => {
    if (!loop || n === 0) return;
    const track = trackRef.current;
    if (!track || skipScrollSync.current) return;
    const x = track.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < track.children.length; i++) {
      const el = track.children[i] as HTMLElement;
      const d = Math.abs(el.offsetLeft - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best < n) {
      const target = track.children[best + n] as HTMLElement;
      const left = target.offsetLeft;
      skipScrollSync.current = true;
      track.scrollTo({ left: Math.max(0, left), behavior: "auto" });
      setTimeout(() => {
        skipScrollSync.current = false;
      }, 30);
    } else if (best >= 2 * n) {
      const target = track.children[best - n] as HTMLElement;
      const left = target.offsetLeft;
      skipScrollSync.current = true;
      track.scrollTo({ left: Math.max(0, left), behavior: "auto" });
      setTimeout(() => {
        skipScrollSync.current = false;
      }, 30);
    }
    setLogicalActive(best % n);
  }, [loop, n]);

  useEffect(() => {
    if (!loop) return;
    const track = trackRef.current;
    if (!track) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (skipScrollSync.current) return;
      clearTimeout(t);
      t = setTimeout(() => syncLoopPosition(), 80);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      track.removeEventListener("scroll", onScroll);
    };
  }, [loop, syncLoopPosition]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 2) return;
      event.preventDefault();
      pauseAutoTemporarily();
      pendingWheelDeltaRef.current += delta;
      if (wheelRafRef.current != null) return;
      wheelRafRef.current = window.requestAnimationFrame(() => {
        const amount = pendingWheelDeltaRef.current;
        pendingWheelDeltaRef.current = 0;
        wheelRafRef.current = null;
        track.scrollBy({
          left: amount * WHEEL_SCROLL_FACTOR,
          behavior: "smooth",
        });
      });
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      track.removeEventListener("wheel", onWheel);
      if (wheelRafRef.current != null) {
        window.cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
      pendingWheelDeltaRef.current = 0;
    };
  }, [pauseAutoTemporarily]);

  const scrollLinearTo = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const i = ((index % n) + n) % n;
      setLinearActive(i);
      const track = trackRef.current;
      const cell = track?.children[i] as HTMLElement | undefined;
      if (track && cell) {
        const left = cell.offsetLeft;
        track.scrollTo({ left: Math.max(0, left), behavior });
      }
    },
    [n],
  );

  useLayoutEffect(() => {
    if (loop) return;
    const track = trackRef.current;
    const cell = track?.children[0] as HTMLElement | undefined;
    if (track && cell && n > 0) {
      const left = cell.offsetLeft;
      track.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    }
  }, [loop, n]);

  const onTrackScrollLinear = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (loop) return;
      const t = e.currentTarget;
      const x = t.scrollLeft + t.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < t.children.length; i++) {
        const el = t.children[i] as HTMLElement;
        const mid = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(mid - x);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      setLinearActive(best);
    },
    [loop],
  );

  useEffect(() => {
    if (n <= 1 || autoPaused) return;
    const timer = window.setInterval(() => {
      if (loop) {
        scrollToLogical(logicalActive + 1, "smooth");
      } else {
        scrollLinearTo(linearActive + 1, "smooth");
      }
    }, AUTO_SCROLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loop, n, autoPaused, logicalActive, linearActive, scrollLinearTo, scrollToLogical]);

  const prev = useCallback(() => {
    pauseAutoTemporarily();
    if (loop) scrollToLogical(logicalActive - 1);
    else scrollLinearTo(linearActive - 1);
  }, [loop, logicalActive, linearActive, scrollToLogical, scrollLinearTo, pauseAutoTemporarily]);

  const next = useCallback(() => {
    pauseAutoTemporarily();
    if (loop) scrollToLogical(logicalActive + 1);
    else scrollLinearTo(linearActive + 1);
  }, [loop, logicalActive, scrollToLogical, scrollLinearTo, pauseAutoTemporarily]);

  const activeIdx = loop ? logicalActive : linearActive;

  if (n === 0) return null;

  return (
    <div className={`mw-filmstrip ${hideIntro ? "mw-filmstrip--embedded" : ""} ${loop ? "mw-filmstrip--loop" : ""}`}>
      {!hideIntro && (
        <p className="mw-filmstrip__intro">
          Сейчас в каталоге сильнее всего представлен <strong>вейксерф</strong>. Лента показывает фокус сезона и будущую ширину платформы.
        </p>
      )}
      <div className="mw-filmstrip__chrome">
        {n > 1 && (
          <div className="mw-filmstrip__arrows">
            <button type="button" className="mw-btn mw-btn--nav" onClick={prev} aria-label="Предыдущий кадр">
              ‹
            </button>
            <button type="button" className="mw-btn mw-btn--nav" onClick={next} aria-label="Следующий кадр">
              ›
            </button>
          </div>
        )}
        <div
          className="mw-filmstrip__track"
          ref={trackRef}
          onPointerDown={pauseAutoTemporarily}
          onTouchStart={pauseAutoTemporarily}
          onScroll={loop ? undefined : onTrackScrollLinear}
        >
          {extendedFrames.map(({ frame: f, key }, i) => {
            const isActive = loop ? i === logicalActive + n : i === linearActive;
            const logicalForClick = loop ? i % n : i;
            /** В loop-режиме стартовая прокрутка показывает «средний» блок кадров — отдаём priority трём видимым по центру. */
            const imagePriority = loop ? i >= n && i < n + 3 : i < 3;
            const className = `mw-filmstrip__cell ${isActive ? "mw-filmstrip__cell--active" : ""} ${
              f.emphasis === "pilot" ? "mw-filmstrip__cell--pilot" : "mw-filmstrip__cell--breadth"
            }`;
            const isRemote = /^https?:\/\//i.test(f.imageSrc);
            const content = (
              <>
                <span className="mw-filmstrip__perforation" aria-hidden />
                <span className="mw-filmstrip__frame">
                  {isRemote ? (
                    // eslint-disable-next-line @next/next/no-img-element -- внешние URL из каталога, домены не фиксированы
                    <img
                      src={f.imageSrc}
                      alt=""
                      className="mw-filmstrip__img"
                      loading={imagePriority ? "eager" : "lazy"}
                    />
                  ) : (
                    <Image
                      src={f.imageSrc}
                      alt=""
                      fill
                      className="mw-filmstrip__img"
                      sizes="(max-width: 640px) 50vw, (max-width: 1000px) 34vw, 22vw"
                      quality={80}
                      priority={imagePriority}
                    />
                  )}
                </span>
                <span className="mw-filmstrip__meta">
                  <span className="mw-filmstrip__kicker">{f.kicker}</span>
                  <span className="mw-filmstrip__title">{f.title}</span>
                  <span className="mw-filmstrip__caption">{f.caption}</span>
                </span>
              </>
            );

            if (f.href) {
              return (
                <Link
                  key={key}
                  href={f.href}
                  className={className}
                  aria-current={isActive}
                  aria-label={`${f.title}: ${f.caption}`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={key}
                type="button"
                className={className}
                onClick={() => {
                  pauseAutoTemporarily();
                  if (loop) scrollToLogical(logicalForClick);
                  else scrollLinearTo(logicalForClick);
                }}
                aria-current={isActive}
                aria-label={`${f.title}: ${f.caption}`}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
      {footnote && <p className="mw-filmstrip__footnote">{footnote}</p>}
      <div className="mw-filmstrip__dots" role="tablist" aria-label="Кадры ленты">
        {frames.map((f, i) => (
          <button
            key={f.id}
            type="button"
            className={`mw-filmstrip__dot ${i === activeIdx ? "mw-filmstrip__dot--active" : ""}`}
            aria-label={`Кадр ${i + 1}: ${f.title}`}
            aria-current={i === activeIdx}
            onClick={() => {
              pauseAutoTemporarily();
              if (loop) scrollToLogical(i);
              else scrollLinearTo(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
