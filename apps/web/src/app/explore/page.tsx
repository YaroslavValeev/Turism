import type { Metadata } from "next";
import Link from "next/link";
import { fetchPublicExploreList } from "../../lib/exploreApi";
import type { ExploreHubType } from "../../lib/exploreApi";

export const metadata: Metadata = {
  title: "Темы и направления — программы, подборки, статьи | MyWave",
  description:
    "Тематические страницы MyWaveTour: дисциплины, регионы, сезоны — актуальные программы, материалы и подборки.",
  alternates: { canonical: "/explore" },
};

function typeLabelRu(t: ExploreHubType): string {
  switch (t) {
    case "discipline":
      return "Дисциплина";
    case "region":
      return "Регион";
    case "season":
      return "Сезон";
    default:
      return t;
  }
}

export default async function ExploreIndexPage() {
  const items = await fetchPublicExploreList();

  const byType: Record<ExploreHubType, typeof items> = { discipline: [], region: [], season: [] };
  for (const it of items) {
    byType[it.type].push(it);
  }

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem" }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>
          Главная
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>Темы</span>
      </nav>
      <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "1rem", fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
        Темы и направления
      </h1>
      <p style={{ color: "var(--mw-muted)", maxWidth: "68ch", lineHeight: 1.65, marginBottom: "2rem" }}>
        Подборки материалов, программ и витринных коллекций по дисциплине, региону или сезону. Переходите к теме — далее программа, статья или заявка организатору.
      </p>

      {items.length === 0 ? (
        <p style={{ color: "var(--mw-muted)" }}>Пока нет опубликованных тематических страниц — загляните позже.</p>
      ) : (
        (["discipline", "region", "season"] as const).map((t) => {
          const list = byType[t];
          if (list.length === 0) return null;
          return (
            <section key={t} style={{ marginBottom: "2.5rem" }}>
              <h2 className="mw-h2" style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
                {typeLabelRu(t)}
              </h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
                {list.map((it) => (
                  <li key={`${it.type}-${it.slug}`}>
                    <Link
                      href={`/explore/${it.type}/${encodeURIComponent(it.slug)}`}
                      style={{ color: "var(--mw-accent)", fontWeight: 600, textDecoration: "none" }}
                    >
                      {it.label}
                    </Link>
                    <span style={{ color: "var(--mw-muted2)", marginLeft: 8, fontSize: "0.9rem" }}>
                      · {it.counts.total}{" "}
                      {it.counts.total === 1 ? "материал" : it.counts.total < 5 ? "материала" : "материалов"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
