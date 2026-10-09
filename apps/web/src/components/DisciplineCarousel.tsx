"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./DisciplineCarousel.module.css";

// Common carousel defaults are 5 s / 400 ms. Give these sculptures more reading time.
export const DISCIPLINE_INTERVAL_MS = 6000;
const WHEEL_SETTLE_MS = 550;
const wrap = (value: number, count: number) => ((value % count) + count) % count;

export type DisciplineCarouselItem = { label: string; href: string };

function sculptureFor(label: string): string | null {
  const value = label.toLowerCase().replace(/ё/g, "е");
  if (/вейксерф|wakesurf/.test(value)) return "wakesurf";
  if (/кайт|kite/.test(value)) return "kite";
  if (/маунтинбайк|mtb|велосипед/.test(value)) return "mtb";
  if (/скалолаз|альпинизм|climbing/.test(value)) return "climbing";
  if (/снегоход|snowmobile/.test(value)) return "snowmobile";
  if (/экспедиц|expedition/.test(value)) return "expedition";
  if (/дикая природа|wildlife/.test(value)) return "wildlife";
  if (/трекинг|trekking|поход/.test(value)) return "trekking";
  if (/лыж|ski|скитур|ски-тур|фрирайд|freeride/.test(value)) return "ski";
  // An unspecified or unfamiliar discipline keeps its real label, without invented equipment.
  return null;
}

export function DisciplineCarousel({ items }: { items: DisciplineCarouselItem[] }) {
  const count = items.length;
  const [position, setPosition] = useState(() => Math.max(0, items.findIndex((item) => /вейксерф|wakesurf/i.test(item.label))));
  const [enabled, setEnabled] = useState(true);
  const [focusStopped, setFocusStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [width, setWidth] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pauseIntent = useRef<boolean | null>(null);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean; id: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const wheelState = useRef({ lastStep: -Infinity, delta: 0, lastEvent: -Infinity });
  const active = count ? wrap(position, count) : 0;
  const rotationEnabled = enabled && !focusStopped && !reducedMotion;
  const rotating = rotationEnabled && !hovered && inView && pageVisible && count > 1 && !dragOffset;
  const gap = width > 760 ? 220 : width > 520 ? 180 : width ? Math.min(155, width * 0.43) : 180;

  const move = useCallback((direction: number) => {
    setFocusStopped(true);
    setPosition((value) => value + direction);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    updateMotion();
    updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35), { threshold: 0.35 });
    const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (rootRef.current) observer.observe(rootRef.current);
    if (stageRef.current) resize.observe(stageRef.current);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
      resize.disconnect();
    };
  }, [count > 0]);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setPosition((value) => value + 1), DISCIPLINE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [rotating]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || count < 2) return;
    const wheel = wheelState.current;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return; // Preserve browser zoom.
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const raw = horizontal ? event.deltaX : event.deltaY;
      if (!raw) return;
      const direction = Math.sign(raw);
      // Vertical scrolling leaves the carousel at either end; the page is never trapped.
      if (!horizontal && ((active === 0 && direction < 0) || (active === count - 1 && direction > 0))) return;
      event.preventDefault();
      const now = performance.now();
      if (now - wheel.lastStep < WHEEL_SETTLE_MS) return;
      if (now - wheel.lastEvent > 180 || Math.sign(wheel.delta) !== direction) wheel.delta = 0;
      wheel.lastEvent = now;
      wheel.delta += raw * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      if (Math.abs(wheel.delta) >= 32) {
        move(direction);
        wheel.lastStep = now;
        wheel.delta = 0;
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [active, count, move]);

  if (!count) return null;

  return (
    <section
      ref={rootRef}
      className={styles.root}
      data-rotating={rotating}
      aria-labelledby="discipline-carousel-title"
      aria-roledescription="карусель"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusStopped(true)}
    >
      <div className="mw-container">
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Направления</p>
            <h2 id="discipline-carousel-title">Выберите свой спорт</h2>
          </div>
          {count > 1 && (
            <button
              type="button"
              className={styles.rotation}
              aria-controls="discipline-carousel-stage"
              aria-label={rotationEnabled ? "Остановить автоматическое вращение" : "Запустить автоматическое вращение"}
              disabled={reducedMotion}
              onPointerDown={() => { pauseIntent.current = rotationEnabled; }}
              onPointerCancel={() => { pauseIntent.current = null; }}
              onKeyDown={() => { pauseIntent.current = null; }}
              onClick={() => {
                setEnabled(!(pauseIntent.current ?? rotationEnabled));
                setFocusStopped(false);
                pauseIntent.current = null;
              }}
            >
              <span aria-hidden="true">{rotationEnabled ? "Ⅱ" : "▷"}</span>
              {rotationEnabled ? "Пауза" : reducedMotion ? "Без анимации" : "Продолжить"}
            </button>
          )}
        </div>
        <div
          id="discipline-carousel-stage"
          ref={stageRef}
          className={styles.stage}
          data-dragging={Boolean(dragOffset)}
          tabIndex={count > 1 ? 0 : -1}
          aria-label="Выбор дисциплины"
          aria-describedby="discipline-carousel-help"
          onKeyDown={(event) => {
            const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (direction || event.key === "Home" || event.key === "End") {
              event.preventDefault();
              if (direction) move(direction);
              else { setFocusStopped(true); setPosition(event.key === "Home" ? 0 : count - 1); }
              stageRef.current?.focus({ preventScroll: true });
            }
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0 || count < 2) return;
            setFocusStopped(true);
            gesture.current = { x: event.clientX, y: event.clientY, horizontal: false, id: event.pointerId };
          }}
          onPointerMove={(event) => {
            const current = gesture.current;
            if (!current || current.id !== event.pointerId) return;
            const dx = event.clientX - current.x;
            const dy = event.clientY - current.y;
            if (!current.horizontal && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
              current.horizontal = true;
              setFocusStopped(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            if (current.horizontal) {
              setDragOffset(Math.max(-gap, Math.min(gap, dx)));
              suppressClickUntil.current = Date.now() + 500;
            }
          }}
          onPointerUp={(event) => {
            const current = gesture.current;
            if (!current || current.id !== event.pointerId) return;
            if (current.horizontal && Math.abs(event.clientX - current.x) > 36) {
              move(event.clientX < current.x ? 1 : -1);
            }
            gesture.current = null;
            setDragOffset(0);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { gesture.current = null; setDragOffset(0); }}
          onLostPointerCapture={() => { gesture.current = null; setDragOffset(0); }}
          onClickCapture={(event) => {
            if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
          }}
        >
          <div className={styles.orbit} aria-hidden="true" />
          {items.map((item, index) => {
            const offset = wrap(index - position + count / 2, count) - count / 2;
            const distance = offset + (gap ? dragOffset / gap : 0);
            const visible = Math.abs(distance) < 2.5;
            const sculpture = sculptureFor(item.label);
            const angle = Math.max(-2.5, Math.min(2.5, distance)) * 0.55;
            const itemStyle = {
              "--figure-x": `${Math.sin(angle) * (gap / Math.sin(0.55))}px`,
              "--figure-y": `${Math.abs(distance) * 13}px`,
              "--figure-scale": Math.max(0.54, 1 - Math.abs(distance) * 0.18),
              "--figure-turn": `${-distance * 12}deg`,
              "--figure-opacity": Math.max(0.45, 1 - Math.abs(distance) * 0.2),
              opacity: visible ? 1 : 0,
              zIndex: Math.round(100 - Math.abs(distance) * 10),
              pointerEvents: visible ? "auto" : "none",
            } as CSSProperties;
            return (
              <div key={item.label} className={styles.item} style={itemStyle} aria-hidden={!visible}>
                <Link
                  href={item.href}
                  className={styles.figure}
                  data-active={index === active}
                  tabIndex={index === active ? 0 : -1}
                  aria-label={`${item.label}: показать программы`}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <span className={styles.sculpture}>
                    {sculpture ? (
                      <img src={`/media/disciplines/${sculpture}.webp`} alt="" width={400} height={440} draggable={false} decoding="async" />
                    ) : (
                      <svg className={styles.compass} viewBox="0 0 160 160" aria-hidden="true">
                        <circle cx="80" cy="80" r="58" /><circle cx="80" cy="80" r="49" />
                        <path d="m99 47-10 43-28 23 10-43Z" /><path d="m80 17 0 8m0 110v8M17 80h8m110 0h8" />
                      </svg>
                    )}
                  </span>
                  <strong>{item.label}</strong>
                  <span className={styles.linkHint} aria-hidden="true">Смотреть программы <span>↗</span></span>
                </Link>
              </div>
            );
          })}
        </div>
        <div className={styles.footer}>
          <p id="discipline-carousel-help" className={styles.help}>Колесо мыши · свайп · клавиши ← →</p>
          {count > 1 && (
            <div className={styles.navigation}>
              <button type="button" aria-label="Предыдущая дисциплина" aria-controls="discipline-carousel-stage" onClick={() => move(-1)}>←</button>
              <span className={styles.counter} aria-live={rotating ? "off" : "polite"} aria-atomic="true">
                <span className={styles.srOnly}>{items[active].label}. Дисциплина </span>
                {String(active + 1).padStart(2, "0")}<span aria-hidden="true"> / </span><span className={styles.srOnly}> из </span>{String(count).padStart(2, "0")}
              </span>
              <button type="button" aria-label="Следующая дисциплина" aria-controls="discipline-carousel-stage" onClick={() => move(1)}>→</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
