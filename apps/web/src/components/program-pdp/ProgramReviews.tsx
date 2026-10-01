import { formatDateRu, reviewsCountLabel } from "../../lib/programDisplay";
import { Prose } from "./ProgramText";
import { ProgramSection } from "./ProgramSection";

export type PublicReviewView = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

function clampRating(rating: number): number {
  return Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
}

export function ProgramReviews({
  reviews,
  stats,
}: {
  reviews: PublicReviewView[];
  stats: { avg: number | null; count: number };
}) {
  return (
    <ProgramSection id="reviews" title="Отзывы участников">
      {reviews.length === 0 ? (
        <p className="mw-pdp-empty">
          Отзывов участников MyWaveTour пока нет. Отзывы публикуются после завершённой поездки и модерации.
        </p>
      ) : (
        <>
          {stats.avg != null && (
            <p className="mw-pdp-reviews__summary">
              <strong>{stats.avg.toFixed(1)} из 5</strong> · {reviewsCountLabel(stats.count)}
            </p>
          )}
          <ul className="mw-pdp-reviews">
            {reviews.map((r) => {
              const stars = clampRating(r.rating);
              return (
                <li key={r.id} className="mw-pdp-review">
                  <p className="mw-pdp-review__head">
                    <span className="mw-pdp-review__stars" role="img" aria-label={`Оценка ${stars} из 5`}>
                      {"★".repeat(stars)}
                      <span aria-hidden="true" className="mw-pdp-review__stars-off">
                        {"★".repeat(5 - stars)}
                      </span>
                    </span>
                    {formatDateRu(r.createdAt) && (
                      <time dateTime={r.createdAt} className="mw-pdp-review__date">
                        {formatDateRu(r.createdAt)}
                      </time>
                    )}
                  </p>
                  {r.comment && <Prose text={r.comment} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ProgramSection>
  );
}
