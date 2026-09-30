import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  EQUIPMENT_LABEL_RU,
  WATER_BODY_LABEL_RU,
  compareIdsFromQuery,
  fetchSpotsCompare,
  fetchSpotsMethodology,
  formatScore,
  type PublicSpot,
  type PublicSpotUnit,
} from "../../../lib/spotsApi";
import { SpotRatingBadge } from "../SpotRatingBadge";

export const metadata: Metadata = {
  title: "Сравнение вейксерф-спотов | MyWaveTour",
  description: "Сравнение официальных оценок вейксерф-спотов по шести категориям методики MyWave.",
  alternates: { canonical: "/spots/compare" },
  // Страница собирается из query-параметров: бесконечное число комбинаций не индексируем.
  robots: { index: false, follow: true },
};

function ratedUnit(spot: PublicSpot): PublicSpotUnit | null {
  return (
    spot.units
      .filter((u) => u.rating)
      .sort((a, b) => (b.rating?.officialScore ?? 0) - (a.rating?.officialScore ?? 0))[0] ?? null
  );
}

const cell = { padding: "0.65rem 0.8rem", borderBottom: "1px solid rgba(13, 105, 94, 0.12)", verticalAlign: "top" } as const;
const headCell = { ...cell, textAlign: "left", color: "#4a625f", fontWeight: 600, whiteSpace: "nowrap" } as const;

export default async function SpotsComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  await connection();
  const ids = compareIdsFromQuery((await searchParams).ids);
  const [spots, methodology] = await Promise.all([fetchSpotsCompare(ids), fetchSpotsMethodology()]);
  const units = (spots ?? []).map(ratedUnit);

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem" }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>Главная</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <Link href="/spots" style={{ color: "var(--mw-accent)" }}>Споты</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>Сравнение</span>
      </nav>

      <h1 className="mw-h1" style={{ marginTop: 0, fontSize: "clamp(1.6rem, 4vw, 2.2rem)" }}>Сравнение спотов</h1>

      {spots === null ? (
        <div className="mw-empty-state">
          <h2>Сравнение временно недоступно</h2>
          <p>Попробуйте обновить страницу через минуту.</p>
        </div>
      ) : spots.length < 2 ? (
        <div className="mw-empty-state">
          <h2>Выберите от 2 до 4 спотов</h2>
          <p>Отметьте споты в каталоге и нажмите «Сравнить».</p>
          <Link href="/spots" className="mw-btn mw-btn--primary">Перейти в каталог</Link>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: "var(--mw-radius-lg)", border: "1px solid rgba(13, 105, 94, 0.18)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={headCell} scope="col">Критерий</th>
                  {spots.map((spot) => (
                    <th key={spot.id} style={{ ...cell, textAlign: "left" }} scope="col">
                      <Link href={`/spots/${spot.id}`} style={{ color: "var(--mw-text)" }}>{spot.name}</Link>
                      <div style={{ fontWeight: 400, fontSize: "0.88rem", color: "#58706d" }}>
                        {spot.region}
                        {spot.waterBodyType ? ` · ${WATER_BODY_LABEL_RU[spot.waterBodyType] ?? spot.waterBodyType}` : ""}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th style={headCell} scope="row">Официальная оценка</th>
                  {spots.map((spot) => (
                    <td key={spot.id} style={cell}><SpotRatingBadge rating={spot.bestRating} /></td>
                  ))}
                </tr>
                {(methodology?.categories ?? []).map((category) => (
                  <tr key={category.id}>
                    <th style={headCell} scope="row">
                      {category.label} <span style={{ fontWeight: 400 }}>· {category.weight}%</span>
                    </th>
                    {units.map((unit, i) => {
                      const score = unit?.rating?.categoryScores?.[category.id];
                      return <td key={spots[i].id} style={cell}>{score != null ? formatScore(score) : "—"}</td>;
                    })}
                  </tr>
                ))}
                <tr>
                  <th style={headCell} scope="row">Протестированная услуга</th>
                  {units.map((unit, i) => (
                    <td key={spots[i].id} style={cell}>
                      {unit ? (
                        <>
                          <div>{unit.serviceName}</div>
                          {Object.entries(unit.equipment).map(([key, value]) => (
                            <div key={key} style={{ fontSize: "0.88rem", color: "#58706d" }}>
                              {EQUIPMENT_LABEL_RU[key] ?? key}: {value}
                            </div>
                          ))}
                        </>
                      ) : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th style={headCell} scope="row">Связь с MyWave</th>
                  {spots.map((spot) => (
                    <td key={spot.id} style={cell}>{spot.relatedToMyWave ? "Да (внешний эксперт обязателен)" : "Нет"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ color: "#58706d", fontSize: "0.92rem", marginTop: "1rem" }}>
            Оценки по категориям взяты из опубликованного снимка лучшей по рейтингу услуги на споте.{" "}
            <Link href="/spots/methodology" style={{ color: "var(--mw-accent)" }}>Как считается рейтинг</Link>
          </p>
        </>
      )}
    </div>
  );
}
