import { ProgramPrice } from "../ProgramPrice";
import {
  formatProgramPrice,
  formatProgramPriceRub,
  formatProgramPriceRubTitle,
  type ProgramPriceFields,
} from "../../lib/priceFormat";
import { reviewsCountLabel } from "../../lib/programDisplay";
import { IconArrowRight, IconCalendar, IconCheck, IconStar } from "./icons";

export const PDP_DISCLAIMER = "Заявка не является бронированием. Финальные условия подтвердит организатор.";

type Props = {
  price: ProgramPriceFields;
  datesLabel: string | null;
  durationLabel: string | null;
  included: { shown: string[]; rest: number } | null;
  rating: { avg: number; count: number } | null;
  ended: boolean;
};

/** Главный conversion-блок: даты, цена, ₽-эквивалент, краткая сводка, CTA на существующую форму `#request`. */
export function ProgramDecisionPanel({ price, datesLabel, durationLabel, included, rating, ended }: Props) {
  const hasPrice = formatProgramPrice(price) != null;
  const rateNote = formatProgramPriceRub(price) ? formatProgramPriceRubTitle(price) : undefined;
  return (
    <div className="mw-pdp-panel">
      {(datesLabel || durationLabel) && (
        <div className="mw-pdp-panel__row mw-pdp-panel__dates">
          <IconCalendar />
          <div>
            {datesLabel && <p className="mw-pdp-panel__dates-main">{datesLabel}</p>}
            {durationLabel && <p className="mw-pdp-panel__muted">{durationLabel}</p>}
          </div>
        </div>
      )}

      <div className="mw-pdp-panel__price">
        {hasPrice ? (
          <ProgramPrice program={price} className="mw-pdp-panel__price-value" />
        ) : (
          <p className="mw-pdp-panel__price-empty">Стоимость уточняется</p>
        )}
        {rateNote && <p className="mw-pdp-panel__muted mw-pdp-panel__small">{rateNote}</p>}
      </div>

      {included && included.shown.length > 0 && (
        <div className="mw-pdp-panel__included">
          <p className="mw-pdp-panel__label">Включено · по данным организатора</p>
          <ul>
            {included.shown.map((line, index) => (
              <li key={`${index}-${line}`}>
                <IconCheck />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {included.rest > 0 && (
            <a href="#inclusions" className="mw-pdp-panel__more">
              и ещё {included.rest} — подробнее
            </a>
          )}
        </div>
      )}

      {rating && (
        <a href="#reviews" className="mw-pdp-panel__rating">
          <IconStar />
          <span>
            {rating.avg.toFixed(1)} · {reviewsCountLabel(rating.count)}
          </span>
        </a>
      )}

      <a href="#request" className="mw-btn mw-btn--primary mw-pdp-cta">
        <span>{ended ? "Выезд завершён" : "Уточнить наличие мест"}</span>
        {!ended && <IconArrowRight />}
      </a>
      <p className="mw-pdp-panel__disclaimer">{PDP_DISCLAIMER}</p>
    </div>
  );
}
