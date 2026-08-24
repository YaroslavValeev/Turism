"use client";

import Link from "next/link";
import {
  applyProgramCardImageFallback,
  normalizeProgramCardCoverSrc,
  pickBestProgramCoverImageUrl,
  programCardCoverFit,
  programCardCoverPlaceholderClass,
} from "../lib/programCardCover";
import { getDisciplineDisplay } from "../lib/disciplineLabels";
import type { ProgramCardProgram } from "../lib/programCardModel";
import { ProgramCardBody } from "./ProgramCardBody";

export type { ProgramCardProgram } from "../lib/programCardModel";

type Props = {
  program: ProgramCardProgram;
  levelLabel: string;
  catalogHrefBuilder?: (next: { discipline?: string; region?: string }) => string;
  /** Query string без `?` — для UTM / collection_id */
  programHrefQuery?: string;
};

export function ProgramCard({ program, levelLabel, catalogHrefBuilder, programHrefQuery }: Props) {
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
    <article className="mw-program-card">
      <Link
        href={pdp}
        className="mw-program-card__cover-link"
        aria-label={`Подробнее: ${program.title}`}
      >
        <div className="mw-program-card__cover">
          {coverUrl ? (
            <div className={`mw-program-card__cover-frame mw-program-card__cover-frame--${coverFit}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL из API, домены не фиксированы */}
              <img
                src={normalizeProgramCardCoverSrc(coverUrl)}
                alt={program.title}
                className={`mw-program-card__cover-img mw-program-card__cover-img--${coverFit}`}
                loading="lazy"
                onError={(event) => {
                  applyProgramCardImageFallback(event.currentTarget);
                }}
              />
            </div>
          ) : (
            <div className={`mw-program-card__cover-placeholder ${placeholderMod}`} aria-hidden>
              <span className="mw-program-card__cover-label">{discipline.original}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="mw-program-card__body">
        <h3 className="mw-program-card__title">
          <Link href={pdp}>{program.title}</Link>
        </h3>
        <ProgramCardBody
          program={program}
          levelLabel={levelLabel}
          catalogHrefBuilder={catalogHrefBuilder}
          programHrefQuery={programHrefQuery}
        />
      </div>
    </article>
  );
}
