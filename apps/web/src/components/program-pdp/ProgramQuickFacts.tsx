import Link from "next/link";
import type { ReactNode } from "react";

export type QuickFact = {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
  /** Если значение — оценка платформы, а не слова организатора. */
  note?: string;
};

/** Ключевые факты из данных программы; отсутствующие пункты не передаются, сетка перестраивается сама. */
export function ProgramQuickFacts({ facts }: { facts: QuickFact[] }) {
  if (facts.length === 0) return null;
  return (
    <section className="mw-pdp-facts" aria-label="Ключевые детали">
      <ul className="mw-pdp-facts__grid">
        {facts.map((fact) => (
          <li key={fact.key} className="mw-pdp-facts__item">
            <span className="mw-pdp-facts__icon">{fact.icon}</span>
            <span className="mw-pdp-facts__text">
              <span className="mw-pdp-facts__value">
                {fact.href ? <Link href={fact.href}>{fact.value}</Link> : fact.value}
              </span>
              <span className="mw-pdp-facts__label">{fact.label}</span>
              {fact.note && <span className="mw-pdp-facts__note">{fact.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
