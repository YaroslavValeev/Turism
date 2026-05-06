import Link from "next/link";
import {
  PROGRAM_CARD_PLACEHOLDER_URL,
  normalizeProgramCardCoverSrc,
  pickBestProgramCoverImageUrl,
  programCardCoverFit,
  programCardCoverPlaceholderClass,
} from "../lib/programCardCover";
import { getDisciplineDisplay } from "../lib/disciplineLabels";
import type { ProgramCardProgram } from "../lib/programCardModel";
import { ProgramCardBody } from "./ProgramCardBody";

type Props = {
  program: ProgramCardProgram;
  levelLabel: string;
  catalogHrefBuilder?: (next: { discipline?: string; region?: string }) => string;
  programHrefQuery?: string;
};

export function ProgramRailCard({ program, levelLabel, catalogHrefBuilder, programHrefQuery }: Props) {
  const pq = programHrefQuery && programHrefQuery.length > 0 ? `?${programHrefQuery.replace(/^\?/, "")}` : "";
  const pdp = `/program/${program.id}${pq}`;
  const coverUrl = pickBestProgramCoverImageUrl(
    program.media,
    [program.title, program.audienceFit].filter(Boolean).join(" "),
  );
  const coverFit = programCardCoverFit(coverUrl, program.title, program.organizer?.displayName);
  const placeholderMod = programCardCoverPlaceholderClass(program.title, program.id);
  const discipline = getDisciplineDisplay(program.discipline);

  return (
    <article className="mw-rail-card">
      <Link
        href={pdp}
        className="mw-rail-card__cover-link"
        aria-label={`Перейти к программе: ${program.title}`}
      >
        <div className="mw-rail-card__cover">
          {coverUrl ? (
            <div className={`mw-rail-card__cover-frame mw-rail-card__cover-frame--${coverFit}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL из API */}
              <img
                src={normalizeProgramCardCoverSrc(coverUrl)}
                alt={program.title}
                className={`mw-rail-card__cover-img mw-rail-card__cover-img--${coverFit}`}
                loading="lazy"
                onError={(event) => {
                  const img = event.currentTarget;
                  if (img.dataset.fallbackApplied === "1") return;
                  img.dataset.fallbackApplied = "1";
                  img.src = PROGRAM_CARD_PLACEHOLDER_URL;
                }}
              />
            </div>
          ) : (
            <div
              className={`mw-rail-card__cover-placeholder mw-program-card__cover-placeholder ${placeholderMod}`}
              aria-hidden
            >
              <span className="mw-rail-card__cover-label">{discipline.original}</span>
            </div>
          )}
        </div>
      </Link>
      <h3 className="mw-rail-card__title">
        <Link href={pdp}>{program.title}</Link>
      </h3>
      <details className="mw-rail-card__details">
        <summary className="mw-rail-card__summary">Подробнее</summary>
        <div className="mw-rail-card__expand">
          <ProgramCardBody
            program={program}
            levelLabel={levelLabel}
            catalogHrefBuilder={catalogHrefBuilder}
            programHrefQuery={programHrefQuery}
          />
        </div>
      </details>
    </article>
  );
}
