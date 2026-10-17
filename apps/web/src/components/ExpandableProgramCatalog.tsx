"use client";

import { getProgramLevelLabel } from "@mywave/shared-types";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { ProgramCard, type ProgramCardProgram } from "./ProgramCard";
import styles from "./ExpandableProgramCatalog.module.css";

type Props = {
  programs: ProgramCardProgram[];
  catalogHrefBuilder: ComponentProps<typeof ProgramCard>["catalogHrefBuilder"];
};

const BATCH_SIZE = 10;

export function ExpandableProgramCatalog({ programs, catalogHrefBuilder }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const nextFocusIndex = useRef<number | null>(null);
  const hasMore = visibleCount < programs.length;

  useEffect(() => {
    const index = nextFocusIndex.current;
    if (index === null) return;
    listRef.current?.children[index]?.querySelector("a")?.focus({ preventScroll: true });
    nextFocusIndex.current = null;
  }, [visibleCount]);

  if (programs.length === 0) return null;

  return (
    <div className={styles.catalog}>
      <div id={listId} ref={listRef} className={visibleCount > 0 ? "program-grid" : undefined}>
        {programs.slice(0, visibleCount).map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            levelLabel={getProgramLevelLabel(program.levelRequired)}
            catalogHrefBuilder={catalogHrefBuilder}
          />
        ))}
      </div>
      <div className={styles.more}>
        {hasMore && (
          <button
            type="button"
            className={`mw-btn mw-btn--ghost ${styles.button}`}
            aria-controls={listId}
            aria-expanded={visibleCount > 0}
            onClick={() => {
              nextFocusIndex.current = visibleCount;
              setVisibleCount((count) => Math.min(count + BATCH_SIZE, programs.length));
            }}
          >
            Показать туры ещё
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <p className={styles.count} role="status" aria-atomic="true">
          {visibleCount === 0 ? "По 10 предложений за раз" : `Показано ${visibleCount} из ${programs.length}`}
        </p>
      </div>
    </div>
  );
}
