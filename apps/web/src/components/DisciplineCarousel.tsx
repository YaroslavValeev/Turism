"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { arrangeDisciplineItems, sculptureBounds, sculptureFor, type DisciplineCarouselItem } from "../lib/disciplineSculptures";
import { advanceDisciplinePosition, disciplinePose, wrapDisciplinePosition as wrap } from "../lib/disciplineMotion";
import { displayValue } from "../lib/programDisplay";
import styles from "./DisciplineCarousel.module.css";

const INTERACTION_PAUSE_MS = 8000;
const WHEEL_SETTLE_MS = 700;
const MANUAL_MOVE_MS = 500;

function figureStyle(pose: ReturnType<typeof disciplinePose>): CSSProperties {
  return {
    transform: `translateX(-50%) translate3d(${pose.x}px, 0, ${pose.z}px) rotateY(${pose.turn}deg) scale(${pose.scale})`,
    "--figure-opacity": pose.inkOpacity,
    opacity: pose.opacity,
    zIndex: pose.zIndex,
    pointerEvents: pose.opacity > 0 ? "auto" : "none",
  } as CSSProperties;
}

export type { DisciplineCarouselItem } from "../lib/disciplineSculptures";

export function DisciplineCarousel({ items: catalogItems }: { items: DisciplineCarouselItem[] }) {
  const items = useMemo(() => arrangeDisciplineItems(catalogItems), [catalogItems]);
  const count = items.length;
  const [position, setPosition] = useState(() => Math.max(0, items.findIndex((item) => /вейксерф|wakesurf/i.test(item.label))));
  const [enabled, setEnabled] = useState(true);
  const [focusStopped, setFocusStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [width, setWidth] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [motionVersion, setMotionVersion] = useState(0);
  const phase = useRef(position);
  const activeRef = useRef(position);
  const figures = useRef<(HTMLDivElement | null)[]>([]);
  const manualMotion = useRef<{ from: number; to: number; startedAt: number | null } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLAnchorElement>(null);
  const pauseIntent = useRef<boolean | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean; id: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const wheelState = useRef({ lastStep: -Infinity, delta: 0, lastEvent: -Infinity });
  const active = count ? wrap(position, count) : 0;
  const activeLabel = count ? displayValue(items[active].label) ?? "Другие выезды" : "";
  const rotationEnabled = enabled && !focusStopped && !reducedMotion;
  const rotating = rotationEnabled && !hovered && !interactionPaused && inView && pageVisible && count > 1 && !dragOffset;
  const figureWidth = width > 600 ? Math.min(190, Math.max(154, width * 0.12)) : 150;
  // Keep a hidden figure at the seam, so wrapping never sweeps across the scene.
  const visibleSteps = Math.min(
    Math.max(0.25, count / 2 - 0.75),
    Math.max(2, Math.min(Math.floor((count - 1) / 2) - 1, Math.ceil(width / (figureWidth * 1.56)))),
  );
  const angleStep = width > 600 ? 0.9 / Math.max(2, visibleSteps) : 0.55;
  const gap = width > 600
    ? Math.max(86, (width / 2 - figureWidth * 0.22) * Math.sin(angleStep) / Math.sin(0.9))
    : width > 520 ? 100 : width ? Math.min(90, width * 0.27) : 90;

  const pauseForInteraction = useCallback(() => {
    setInteractionPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      setInteractionPaused(false);
      resumeTimer.current = null;
    }, INTERACTION_PAUSE_MS);
  }, []);

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const paint = useCallback((value: number) => {
    figures.current.forEach((element, index) => {
      if (!element || index >= count) return;
      const pose = disciplinePose(index, value, count, gap, angleStep, visibleSteps);
      const style = figureStyle(pose);
      element.style.transform = style.transform!;
      element.style.opacity = String(style.opacity);
      element.style.zIndex = String(style.zIndex);
      element.style.pointerEvents = style.pointerEvents!;
      element.style.setProperty("--figure-opacity", String(pose.inkOpacity));
      const hidden = String(pose.opacity === 0);
      if (element.getAttribute("aria-hidden") !== hidden) element.setAttribute("aria-hidden", hidden);
    });
    const next = wrap(Math.round(value), count);
    if (next !== activeRef.current) {
      activeRef.current = next;
      setPosition(next);
    }
  }, [count, gap, angleStep, visibleSteps]);

  const moveTo = useCallback((target: number) => {
    pauseForInteraction();
    manualMotion.current = { from: phase.current, to: target, startedAt: null };
    setMotionVersion((value) => value + 1);
  }, [pauseForInteraction]);

  const move = useCallback((direction: number) => {
    moveTo(Math.round(manualMotion.current?.to ?? phase.current) + direction);
  }, [moveTo]);

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
    phase.current = wrap(phase.current, count);
    paint(phase.current - (gap ? dragOffset / gap : 0));
  }, [paint, count, gap, dragOffset]);

  useEffect(() => {
    if (!count || !inView || !pageVisible) return;
    if (reducedMotion && manualMotion.current) {
      phase.current = wrap(manualMotion.current.to, count);
      manualMotion.current = null;
      paint(phase.current);
    }
    if (reducedMotion || (!rotating && !manualMotion.current)) return;
    let frame: number;
    let previousTime: number | null = null;
    const tick = (now: number) => {
      const elapsed = previousTime === null ? 0 : now - previousTime;
      previousTime = now;
      const manual = manualMotion.current;
      if (manual) {
        manual.startedAt ??= now;
        const progress = Math.min(1, (now - manual.startedAt) / MANUAL_MOVE_MS);
        phase.current = manual.from + (manual.to - manual.from) * (1 - (1 - progress) ** 3);
        if (progress === 1) {
          phase.current = wrap(manual.to, count);
          manualMotion.current = null;
        }
      } else if (rotating) {
        phase.current = advanceDisciplinePosition(phase.current, elapsed, count);
      }
      paint(phase.current);
      if (rotating || manualMotion.current) frame = requestAnimationFrame(tick);
    };
    // Each restart gets a fresh clock: paused/hidden time is never fast-forwarded.
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (manualMotion.current) {
        manualMotion.current.from = phase.current;
        manualMotion.current.startedAt = null;
      }
    };
  }, [rotating, reducedMotion, inView, pageVisible, count, paint, motionVersion]);

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
      style={{ "--carousel-figure-width": `${figureWidth}px` } as CSSProperties}
      data-rotating={rotating}
      aria-labelledby="discipline-carousel-title"
      aria-roledescription="карусель"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) setFocusStopped(true);
      }}
    >
      <div className={`mw-container ${styles.heading}`}>
        <h2 id="discipline-carousel-title">Выбирай свой спортивный отдых</h2>
        {count > 1 && (
          <button
            type="button"
            className={styles.rotation}
            aria-controls="discipline-carousel-stage"
            aria-label={rotationEnabled ? "Остановить автоматическое вращение" : "Запустить автоматическое вращение"}
            title={rotationEnabled ? "Пауза" : reducedMotion ? "Уменьшение движения включено" : "Продолжить"}
            disabled={reducedMotion}
            onPointerDown={() => { pauseIntent.current = rotationEnabled; }}
            onPointerCancel={() => { pauseIntent.current = null; }}
            onKeyDown={() => { pauseIntent.current = null; }}
            onClick={() => {
              setEnabled(!(pauseIntent.current ?? rotationEnabled));
              setFocusStopped(false);
              setInteractionPaused(false);
              if (resumeTimer.current) clearTimeout(resumeTimer.current);
              resumeTimer.current = null;
              pauseIntent.current = null;
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {rotationEnabled
                ? <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                : <path d="m9 5 10 7-10 7V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />}
            </svg>
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
        aria-describedby="discipline-carousel-instructions"
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); captionRef.current?.click(); return; }
          const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (direction || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setFocusStopped(true);
            if (direction) move(direction);
            else {
              const target = event.key === "Home" ? 0 : count - 1;
              moveTo(phase.current + wrap(target - phase.current + count / 2, count) - count / 2);
            }
            stageRef.current?.focus({ preventScroll: true });
          }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || count < 2) return;
          pauseForInteraction();
          manualMotion.current = null;
          gesture.current = { x: event.clientX, y: event.clientY, horizontal: false, id: event.pointerId };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.horizontal && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            current.horizontal = true;
            pauseForInteraction();
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
          pauseForInteraction();
          if (current.horizontal && Math.abs(event.clientX - current.x) > 36) {
            // Continue from the dragged pose instead of snapping back on release.
            const direction = event.clientX < current.x ? 1 : -1;
            const target = Math.round(phase.current) + direction;
            phase.current -= dragOffset / gap;
            moveTo(target);
          } else if (current.horizontal) {
            const target = Math.round(phase.current);
            phase.current -= dragOffset / gap;
            moveTo(target);
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
        <span id="discipline-carousel-instructions" className={styles.srOnly}>Листайте колесом мыши, свайпом или клавишами ← →. Enter открывает программы выбранной дисциплины.</span>
        <div className={styles.orbit} aria-hidden="true" />
        {items.map((item, index) => {
          const pose = disciplinePose(index, phase.current - (gap ? dragOffset / gap : 0), count, gap, angleStep, visibleSteps);
          const visible = pose.opacity > 0;
          const sculpture = sculptureFor(item.label);
          const bounds = sculpture ? sculptureBounds[sculpture] : null;
          return (
            <div key={item.label} ref={(element) => { figures.current[index] = element; }} className={styles.item} style={figureStyle(pose)} aria-hidden={!visible}>
              <Link
                href={item.href}
                className={styles.figure}
                data-active={index === active}
                tabIndex={-1}
                aria-label={`${displayValue(item.label) ?? "Другие выезды"}: показать программы`}
                onDragStart={(event) => event.preventDefault()}
              >
                <span className={styles.sculpture}>
                  {sculpture && bounds ? (
                    <span className={styles.artwork} style={{
                      "--art-ratio": bounds.width / bounds.height,
                      "--art-left": `${-bounds.x / bounds.width * 100}%`,
                      "--art-top": `${-bounds.y / bounds.height * 100}%`,
                      "--art-width": `${400 / bounds.width * 100}%`,
                      "--art-height": `${440 / bounds.height * 100}%`,
                    } as CSSProperties}>
                      <img src={`/media/disciplines/${sculpture}.webp`} alt="" width={400} height={440} draggable={false} decoding="async" />
                    </span>
                  ) : (
                    <svg className={styles.compass} viewBox="16 16 128 128" aria-hidden="true">
                      <circle cx="80" cy="80" r="58" /><circle cx="80" cy="80" r="49" />
                      <path d="m99 47-10 43-28 23 10-43Z" /><path d="m80 17 0 8m0 110v8M17 80h8m110 0h8" />
                    </svg>
                  )}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
      <div className={`mw-container ${styles.footer}`} aria-live={rotating ? "off" : "polite"} aria-atomic="true">
        <Link ref={captionRef} href={items[active].href} className={styles.captionLink} aria-label={`${activeLabel}: показать программы`}>
          <strong>{activeLabel}</strong>
          <span>Смотреть программы <span aria-hidden="true">↗</span></span>
        </Link>
      </div>
    </section>
  );
}
