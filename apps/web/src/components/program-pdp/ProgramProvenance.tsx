import { formatDateRu, formatDateTimeMsk } from "../../lib/programDisplay";
import { IconExternal } from "./icons";
import { Prose } from "./ProgramText";
import { ProgramSection } from "./ProgramSection";

type Props = {
  autoPublished: boolean;
  sourceTypeLabel: string;
  reviewPending: boolean;
  sourceUrl: string | null;
  ingestedAt: string | null | undefined;
  updatedFromSourceAt: string | null | undefined;
  trustReason: string | null;
  originalDescription: string | null;
};

/** «Источник и актуальность»: происхождение данных агрегатора, исходный текст и предупреждение об актуальности. */
export function ProgramProvenance({
  autoPublished,
  sourceTypeLabel,
  reviewPending,
  sourceUrl,
  ingestedAt,
  updatedFromSourceAt,
  trustReason,
  originalDescription,
}: Props) {
  const added = autoPublished ? formatDateRu(ingestedAt) : null;
  const updated = autoPublished ? formatDateTimeMsk(updatedFromSourceAt) : null;
  if (!autoPublished && !trustReason && !originalDescription) return null;

  return (
    <ProgramSection id="source" title="Источник и актуальность">
      {autoPublished && (
        <div className="mw-pdp-provenance">
          <p className="mw-pdp-provenance__lead">
            <span className="mw-pdp-tag">Из открытого источника</span>
            Карточка собрана из открытого источника ({sourceTypeLabel}).
            {reviewPending && " Сейчас на лёгкой проверке редактором."}
          </p>
          {(added || updated) && (
            <dl className="mw-pdp-provenance__meta">
              {added && (
                <div>
                  <dt>Добавлено в MyWaveTour</dt>
                  <dd>{added}</dd>
                </div>
              )}
              {updated && (
                <div>
                  <dt>Обновлено с источника</dt>
                  <dd>{updated}</dd>
                </div>
              )}
            </dl>
          )}
          {sourceUrl && (
            <a href={sourceUrl} rel="nofollow noopener noreferrer" target="_blank" className="mw-pdp-provenance__link">
              <span>Проверить первоисточник</span>
              <IconExternal />
              <span className="mw-visually-hidden"> (откроется в новой вкладке)</span>
            </a>
          )}
        </div>
      )}

      {trustReason && (
        <div className="mw-pdp-subsection">
          <h3 className="mw-pdp-h3">Описание и факты в карточке</h3>
          <Prose text={trustReason} />
        </div>
      )}

      {originalDescription && (
        <div className="mw-pdp-subsection">
          <p className="mw-source-note">
            Описание сохраняет сведения на дату публикации. Упомянутые скидки и сроки регистрации могут быть
            неактуальны — уточните их перед участием.
          </p>
          <details className="mw-source-description">
            <summary>Показать исходное описание</summary>
            <Prose text={originalDescription} />
          </details>
        </div>
      )}
    </ProgramSection>
  );
}
