"use client";

import styles from "./SequencePager.module.css";

type Props = {
  index: number;
  count: number;
  label: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  loop?: boolean;
  live?: "off" | "polite";
  currentLabel?: string;
};

/** Compact, shared navigation for collections: no growing row of page numbers. */
export function SequencePager({ index, count, label, previousLabel, nextLabel, onPrevious, onNext, loop = false, live = "polite", currentLabel }: Props) {
  if (count <= 1) return null;
  const current = Math.max(0, Math.min(index, count - 1));
  return (
    <nav className={styles.root} aria-label={label}>
      <button type="button" onClick={onPrevious} disabled={!loop && current === 0} aria-label={previousLabel}>
        <span aria-hidden="true">←</span>
      </button>
      <span className={styles.counter} aria-live={live} aria-atomic="true">
        <span className={styles.srOnly}>{currentLabel ? `${currentLabel}. ` : ""}Страница </span>{current + 1}<span aria-hidden="true"> / </span><span className={styles.srOnly}> из </span>{count}
      </span>
      <button type="button" onClick={onNext} disabled={!loop && current === count - 1} aria-label={nextLabel}>
        <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}
