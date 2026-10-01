import Link from "next/link";
import { IconArrowLeft, IconPin } from "./icons";

export type ProgramStatusChip = { label: string; tone: "neutral" | "success" | "warning" };

type Props = {
  returnTo: string;
  title: string;
  /** Уже очищенные части мета-строки: «Кэмп», «7 дней». */
  metaParts: string[];
  status: ProgramStatusChip | null;
  region: { label: string; href: string } | null;
  exactLocation: string | null;
};

export function ProgramHero({ returnTo, title, metaParts, status, region, exactLocation }: Props) {
  const hasLocation = Boolean(region || exactLocation);
  return (
    <header className="mw-pdp-hero">
      <Link href={returnTo} className="mw-page-back mw-pdp-back">
        <IconArrowLeft />
        <span>Все программы</span>
      </Link>

      {(metaParts.length > 0 || status) && (
        <div className="mw-pdp-meta">
          {metaParts.length > 0 && <p className="mw-pdp-meta__text">{metaParts.join(" · ")}</p>}
          {status && (
            <span className={`mw-pdp-status mw-pdp-status--${status.tone}`}>
              <span className="mw-pdp-status__dot" aria-hidden="true" />
              {status.label}
            </span>
          )}
        </div>
      )}

      <h1 className="mw-pdp-title">{title}</h1>

      {hasLocation && (
        <p className="mw-pdp-location">
          <IconPin />
          <span>
            {region && (
              <Link href={region.href} className="mw-pdp-location__link">
                {region.label}
              </Link>
            )}
            {region && exactLocation && <span aria-hidden="true"> · </span>}
            {exactLocation && <span>{exactLocation}</span>}
          </span>
        </p>
      )}
    </header>
  );
}
