import type { ResolvedProgramField } from "../../lib/recommendedProgramFields";
import {
  aggregatorLinkLabel,
  enrichmentCaption,
  formatDistanceKm,
  isAccommodationEnrichment,
  isSafeHttpUrl,
  sourceLinkLabel,
  splitHotelGroups,
  type AccommodationEnrichment,
  type EnrichmentHotel,
  type FieldEnrichment,
} from "../../lib/programEnrichment";
import { ProgramInfoField, Prose } from "./ProgramText";

const EXTERNAL_REL = "nofollow noopener";

function HotelList({ title, hotels, showDistance }: { title: string; hotels: EnrichmentHotel[]; showDistance: boolean }) {
  if (hotels.length === 0) return null;
  return (
    <div className="mw-pdp-enrichment__group">
      <p className="mw-pdp-enrichment__group-title">{title}</p>
      <ul className="mw-pdp-list mw-pdp-enrichment__hotels">
        {hotels.map((hotel, index) => {
          const distance = showDistance ? formatDistanceKm(hotel.distanceKm) : "";
          const siteUrl = isSafeHttpUrl(hotel.siteUrl) ? hotel.siteUrl : null;
          const aggregator = hotel.aggregator && isSafeHttpUrl(hotel.aggregator.url) ? hotel.aggregator : null;
          return (
            <li key={`${index}-${hotel.name}`}>
              <strong>{hotel.name}</strong>
              {distance ? <span className="mw-pdp-enrichment__note"> · {distance}</span> : null}
              {hotel.distanceNote ? <span className="mw-pdp-enrichment__note"> — {hotel.distanceNote}</span> : null}
              {siteUrl || aggregator ? (
                <span className="mw-pdp-enrichment__links">
                  {siteUrl ? (
                    <a href={siteUrl} target="_blank" rel={EXTERNAL_REL} className="mw-pdp-inline-link">
                      Сайт отеля
                    </a>
                  ) : null}
                  {aggregator ? (
                    <a href={aggregator.url} target="_blank" rel={EXTERNAL_REL} className="mw-pdp-inline-link">
                      {aggregatorLinkLabel(aggregator)}
                    </a>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccommodationRecommendation({ enrichment }: { enrichment: AccommodationEnrichment }) {
  const groups = splitHotelGroups(enrichment.hotels);
  return (
    <>
      {enrichment.summary ? <Prose text={enrichment.summary} /> : null}
      <HotelList title="Топ по оценкам гостей" hotels={groups.top} showDistance />
      <HotelList title="Рядом с местом программы (до 5 км)" hotels={groups.nearby} showDistance />
      {enrichment.locationPoint?.label ? (
        <p className="mw-pdp-enrichment__note">Расстояния — от точки «{enrichment.locationPoint.label}».</p>
      ) : null}
    </>
  );
}

function RecommendationBlock({ enrichment }: { enrichment: FieldEnrichment }) {
  const sources = enrichment.sources.filter((s) => isSafeHttpUrl(s.url));
  return (
    <div className="mw-pdp-enrichment">
      <p className="mw-organizer-caption mw-pdp-source-caption mw-pdp-source-caption--mywave">
        {enrichmentCaption(enrichment.checkedAt)}
      </p>
      {isAccommodationEnrichment(enrichment) ? (
        <AccommodationRecommendation enrichment={enrichment} />
      ) : (
        <Prose text={enrichment.text} />
      )}
      {sources.length > 0 ? (
        <p className="mw-pdp-enrichment__sources">
          Источники:{" "}
          {sources.map((source, index) => (
            <span key={`${index}-${source.url}`}>
              {index > 0 ? ", " : null}
              <a href={source.url} target="_blank" rel={EXTERNAL_REL} className="mw-pdp-inline-link">
                {sourceLinkLabel(source)}
              </a>
            </span>
          ))}
        </p>
      ) : null}
      <p className="mw-mywave-note">Рекомендуем уточнить у организатора.</p>
    </div>
  );
}

/**
 * Поле логистики: сначала всегда данные организатора; под ними — одобренная рекомендация MyWave.
 * Без рекомендации — прежнее поведение (данные организатора или примечание MyWave).
 */
export function ProgramLogisticsField({
  label,
  value,
  enrichment,
}: {
  label: string;
  value: ResolvedProgramField;
  enrichment?: FieldEnrichment;
}) {
  if (!enrichment) return <ProgramInfoField label={label} value={value} />;
  return (
    <div className="mw-pdp-info-field">
      <h3 className="mw-pdp-h3">{label}</h3>
      {value.mode === "confirmed" ? <Prose text={value.text} /> : <p className="mw-pdp-empty">Организатор не указал.</p>}
      <RecommendationBlock enrichment={enrichment} />
    </div>
  );
}
