import Link from "next/link";
import type { ExploreNavLink } from "@mywave/explore-links";
import { displayValue } from "../../lib/programDisplay";
import { IconArrowRight } from "./icons";

const TYPE_PREFIX: Partial<Record<ExploreNavLink["type"], string>> = {
  discipline: "Дисциплина",
  region: "Регион",
  season: "Сезон",
};

/** «Смотреть ещё по теме»: хабы с невалидной таксономией (Unknown и т.п.) не показываются. */
export function ProgramRelated({ links, entryQuery }: { links: ExploreNavLink[]; entryQuery: string }) {
  const visible = links.filter((l) => displayValue(l.label));
  if (visible.length === 0) return null;
  return (
    <section className="mw-pdp-related" aria-labelledby="related-title">
      <h2 id="related-title" className="mw-pdp-h2">
        Смотреть ещё по теме
      </h2>
      <p className="mw-pdp-related__lead">Если этот формат не подходит — вот похожие варианты:</p>
      <ul className="mw-pdp-related__list">
        {visible.map((l) => (
          <li key={`${l.type}-${l.slug}`}>
            <Link href={`${l.path}?${entryQuery}`} className="mw-pdp-related__link">
              <span>
                {TYPE_PREFIX[l.type] && <span className="mw-pdp-related__type">{TYPE_PREFIX[l.type]}</span>}
                {l.label}
              </span>
              <IconArrowRight />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
