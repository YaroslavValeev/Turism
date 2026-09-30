import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { WATER_BODY_LABEL_RU, fetchPublicSpots, yandexMapsUrl } from "../../lib/spotsApi";
import { SPOT_MAP_MAX_POINTS } from "../../lib/spotsMap";
import { SpotRatingBadge } from "./SpotRatingBadge";
import { SpotsMap } from "./SpotsMap";

const TITLE = "Карта вейксерф-спотов — независимый рейтинг | MyWaveTour";
const DESCRIPTION =
  "Споты для вейксерфа в России с официальной оценкой по методике MyWave: профессиональный тест, обязательные требования безопасности, без влияния рекламы и отзывов.";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const spots = await fetchPublicSpots();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/spots" },
    // Пустой реестр не индексируем: страница без содержания вредит сайту в поиске.
    robots: spots && spots.length > 0 ? undefined : { index: false, follow: true },
    openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: "/spots", siteName: "MyWaveTour" },
  };
}

const cardStyle = {
  height: "100%",
  padding: "1.1rem 1.15rem",
  borderRadius: "var(--mw-radius)",
  background: "#fff",
  border: "1px solid rgba(13, 105, 94, 0.18)",
  boxShadow: "0 12px 30px rgba(16, 44, 40, 0.08)",
  display: "grid",
  gap: "0.75rem",
  alignContent: "start",
} as const;

export default async function SpotsIndexPage() {
  // API недоступен во время docker build: пререндер «запёк» бы пустую страницу до первой ревалидации.
  await connection();
  const spots = await fetchPublicSpots();
  const mapped = (spots ?? [])
    .filter((s): s is typeof s & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null)
    .slice(0, SPOT_MAP_MAX_POINTS);
  const markerNo = new Map(mapped.map((s, i) => [s.id, i + 1]));

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem" }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>Главная</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>Споты</span>
      </nav>

      <section
        style={{
          padding: "clamp(1.25rem, 4vw, 2rem)",
          borderRadius: "var(--mw-radius-lg)",
          background: "linear-gradient(135deg, rgba(210, 250, 243, 0.98), rgba(255, 255, 255, 0.98))",
          border: "1px solid rgba(13, 105, 94, 0.22)",
          marginBottom: "2rem",
        }}
      >
        <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "clamp(1.65rem, 4vw, 2.35rem)" }}>
          Вейксерф-споты
        </h1>
        <p style={{ color: "#385a56", maxWidth: "72ch", lineHeight: 1.65, margin: "0 0 1rem" }}>
          Оценку ставит эксперт после профессионального теста конкретной лодки и услуги. Без обязательных требований
          безопасности рейтинг не публикуется, а реклама, оплата и отзывы на него не влияют.
        </p>
        <Link href="/spots/methodology" className="mw-btn mw-btn--ghost">Как считается рейтинг</Link>
      </section>

      {spots === null ? (
        <div className="mw-empty-state">
          <h2>Список временно недоступен</h2>
          <p>Попробуйте обновить страницу через минуту.</p>
        </div>
      ) : spots.length === 0 ? (
        <div className="mw-empty-state">
          <h2>Реестр готовится</h2>
          <p>Сейчас проходят первые профессиональные тесты. Споты появятся здесь после проверки экспертом.</p>
          <Link href="/spots/methodology" className="mw-btn mw-btn--primary">Прочитать методику</Link>
        </div>
      ) : (
        <>
        {mapped.length > 0 ? <SpotsMap points={mapped} title="Карта вейксерф-спотов" /> : null}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
          }}
        >
          {spots.map((spot) => (
            <li key={spot.id}>
              <article style={cardStyle}>
                <div>
                  <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.1rem", lineHeight: 1.3 }}>
                    {markerNo.has(spot.id) ? (
                      <span
                        aria-label={`Метка ${markerNo.get(spot.id)} на карте`}
                        style={{
                          display: "inline-grid",
                          placeItems: "center",
                          minWidth: "1.6em",
                          height: "1.6em",
                          marginRight: "0.45rem",
                          borderRadius: "999px",
                          background: "#1e98ff",
                          color: "#fff",
                          fontSize: "0.8rem",
                          verticalAlign: "middle",
                        }}
                      >
                        {markerNo.get(spot.id)}
                      </span>
                    ) : null}
                    <Link href={`/spots/${spot.id}`} style={{ color: "inherit", textDecoration: "none" }}>{spot.name}</Link>
                  </h2>
                  <p style={{ margin: 0, color: "#58706d", fontSize: "0.92rem" }}>
                    {spot.region}
                    {spot.waterBodyType ? ` · ${WATER_BODY_LABEL_RU[spot.waterBodyType] ?? spot.waterBodyType}` : ""}
                  </p>
                </div>
                <SpotRatingBadge rating={spot.bestRating} />
                <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
                  <Link href={`/spots/${spot.id}`} className="mw-btn mw-btn--primary" style={{ fontSize: "0.92rem" }}>Подробнее</Link>
                  {spot.latitude != null && spot.longitude != null ? (
                    <a
                      href={yandexMapsUrl(spot.latitude, spot.longitude)}
                      target="_blank"
                      rel="noreferrer"
                      className="mw-btn mw-btn--ghost"
                      style={{ fontSize: "0.92rem" }}
                    >
                      На карте
                    </a>
                  ) : null}
                </p>
              </article>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
