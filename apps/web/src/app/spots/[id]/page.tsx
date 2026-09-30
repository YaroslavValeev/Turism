import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EQUIPMENT_LABEL_RU, WATER_BODY_LABEL_RU, fetchPublicSpot, formatScore, yandexMapsUrl } from "../../../lib/spotsApi";
import { SpotsMap } from "../SpotsMap";
import { SpotRatingBadge } from "../SpotRatingBadge";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const spot = await fetchPublicSpot(id);
  if (!spot) return { title: "Спот не найден | MyWaveTour", robots: { index: false } };
  const rating = spot.bestRating ? ` — ${formatScore(spot.bestRating.officialScore)}, ${spot.bestRating.bandLabelRu}` : "";
  const title = `${spot.name}, ${spot.region}: вейксерф${rating} | MyWaveTour`;
  const description = spot.bestRating
    ? `Официальная оценка вейксерфа на споте «${spot.name}» по методике MyWave ${spot.bestRating.methodologyVersion}.`
    : `Вейксерф на споте «${spot.name}» (${spot.region}). Официальная оценка появится после профессионального теста.`;
  return {
    title,
    description,
    alternates: { canonical: `/spots/${spot.id}` },
    openGraph: { type: "website", title, description, url: `/spots/${spot.id}`, siteName: "MyWaveTour" },
  };
}

export default async function SpotPage({ params }: Props) {
  const { id } = await params;
  const spot = await fetchPublicSpot(id);
  if (!spot) notFound();

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem", maxWidth: 960 }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>Главная</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <Link href="/spots" style={{ color: "var(--mw-accent)" }}>Споты</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>{spot.name}</span>
      </nav>

      <header style={{ marginBottom: "1.75rem" }}>
        <h1 className="mw-h1" style={{ margin: "0 0 0.5rem", fontSize: "clamp(1.6rem, 4vw, 2.2rem)" }}>{spot.name}</h1>
        <p style={{ margin: "0 0 1rem", color: "#4a625f" }}>
          {spot.region}
          {spot.waterBodyType ? ` · ${WATER_BODY_LABEL_RU[spot.waterBodyType] ?? spot.waterBodyType}` : ""}
          {spot.address ? ` · ${spot.address}` : ""}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <SpotRatingBadge rating={spot.bestRating} />
          {spot.latitude != null && spot.longitude != null ? (
            <a href={yandexMapsUrl(spot.latitude, spot.longitude)} target="_blank" rel="noreferrer" className="mw-btn mw-btn--ghost">
              Открыть в Яндекс Картах
            </a>
          ) : null}
        </div>
        {spot.relatedToMyWave ? (
          <p style={{ margin: "1rem 0 0", padding: "0.75rem 1rem", borderRadius: "var(--mw-radius)", background: "#fff8e6", color: "#6b4e00" }}>
            Раскрытие: спот связан с MyWave. Для официальной оценки обязательны внешний эксперт и независимый редактор.
          </p>
        ) : null}
      </header>

      {spot.latitude != null && spot.longitude != null ? (
        <SpotsMap points={[{ latitude: spot.latitude, longitude: spot.longitude }]} title={`${spot.name} на карте`} height={340} />
      ) : null}

      <section>
        <h2 className="mw-h2" style={{ fontSize: "1.25rem", margin: "0 0 0.75rem" }}>Услуги и оценки</h2>
        {spot.units.length === 0 ? (
          <p style={{ color: "#58706d" }}>Услуги на споте ещё не описаны.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.85rem" }}>
            {spot.units.map((unit) => (
              <li
                key={unit.id}
                style={{ padding: "1rem 1.1rem", borderRadius: "var(--mw-radius)", background: "#fff", border: "1px solid rgba(13, 105, 94, 0.18)" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
                  <strong>{unit.serviceName}</strong>
                  <SpotRatingBadge rating={unit.rating} />
                </div>
                {Object.keys(unit.equipment).length ? (
                  <p style={{ margin: "0.5rem 0 0", color: "#58706d", fontSize: "0.92rem" }}>
                    {Object.entries(unit.equipment).map(([k, v]) => `${EQUIPMENT_LABEL_RU[k] ?? k}: ${v}`).join(" · ")}
                  </p>
                ) : null}
                {unit.rating ? (
                  <p style={{ margin: "0.5rem 0 0", color: "#58706d", fontSize: "0.85rem" }}>
                    Опубликовано {new Date(unit.rating.publishedAt).toLocaleDateString("ru-RU")}, действует до{" "}
                    {new Date(unit.rating.expiresAt).toLocaleDateString("ru-RU")} · методика {unit.rating.methodologyVersion}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/spots/methodology" style={{ color: "var(--mw-accent)" }}>Как считается рейтинг →</Link>
      </p>
    </div>
  );
}
