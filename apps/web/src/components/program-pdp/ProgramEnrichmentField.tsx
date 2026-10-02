import type { ResolvedProgramField } from "../../lib/recommendedProgramFields";
import {
  aggregatorLinkLabel,
  enrichmentCaption,
  isAccommodationEnrichment,
  isSafeHttpUrl,
  sourceLinkLabel,
  type FieldEnrichment,
} from "../../lib/programEnrichment";
import { ProgramInfoField, Prose } from "./ProgramText";

const EXTERNAL_REL = "nofollow noopener";

function EnrichmentBody({ enrichment }: { enrichment: FieldEnrichment }) {
  const sources = enrichment.sources.filter((s) => isSafeHttpUrl(s.url));
  return (
    <div className="mw-pdp-enrichment">
      <p className="mw-organizer-caption mw-pdp-source-caption mw-pdp-source-caption--mywave">
        {enrichmentCaption(enrichment.checkedAt)}
      </p>
      {isAccommodationEnrichment(enrichment) ? (
        <>
          {enrichment.summary ? <Prose text={enrichment.summary} /> : null}
          {enrichment.hotels.length > 0 ? (
            <ul className="mw-pdp-list mw-pdp-enrichment__hotels">
              {enrichment.hotels.map((hotel, index) => (
                <li key={`${index}-${hotel.name}`}>
                  <strong>{hotel.name}</strong>
                  {hotel.distanceNote ? <span className="mw-pdp-enrichment__note"> — {hotel.distanceNote}</span> : null}
                  {isSafeHttpUrl(hotel.siteUrl) || (hotel.aggregator && isSafeHttpUrl(hotel.aggregator.url)) ? (
                    <span className="mw-pdp-enrichment__links">
                      {isSafeHttpUrl(hotel.siteUrl) ? (
                        <a href={hotel.siteUrl} target="_blank" rel={EXTERNAL_REL} className="mw-pdp-inline-link">
                          Сайт отеля
                        </a>
                      ) : null}
                      {hotel.aggregator && isSafeHttpUrl(hotel.aggregator.url) ? (
                        <a href={hotel.aggregator.url} target="_blank" rel={EXTERNAL_REL} className="mw-pdp-inline-link">
                          {aggregatorLinkLabel(hotel.aggregator)}
                        </a>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
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

/** Поле логистики: данные организатора → как есть; пусто + одобренное OSINT-дополнение → оно; иначе — обычное примечание MyWave. */
export function ProgramLogisticsField({
  label,
  value,
  enrichment,
}: {
  label: string;
  value: ResolvedProgramField;
  enrichment?: FieldEnrichment;
}) {
  if (value.mode !== "recommended" || !enrichment) return <ProgramInfoField label={label} value={value} />;
  return (
    <div className="mw-pdp-info-field">
      <h3 className="mw-pdp-h3">{label}</h3>
      <EnrichmentBody enrichment={enrichment} />
    </div>
  );
}
