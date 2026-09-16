import type { Metadata } from "next";
import Link from "next/link";
import { exploreNavLinkFromRaw } from "@mywave/explore-links";
import { fetchPublicCollectionList } from "../../lib/collectionsApi";
import { getPublicSiteUrl } from "../../lib/siteUrl";

const COL_DESC = "Тематические подборки: программы, статьи и организаторы в одном маршруте к заявке.";

export const metadata: Metadata = {
  title: "Подборки",
  description: COL_DESC,
  openGraph: { title: "Подборки", description: COL_DESC, type: "website" },
  alternates: { canonical: "/collections" },
};

const hubHeroStyle = {
  padding: "clamp(1.25rem, 4vw, 2rem)",
  borderRadius: "var(--mw-radius-lg)",
  background: "linear-gradient(135deg, rgba(210, 250, 243, 0.98), rgba(255, 255, 255, 0.98))",
  border: "1px solid rgba(13, 105, 94, 0.22)",
  boxShadow: "0 18px 40px rgba(16, 44, 40, 0.1)",
  marginBottom: "2rem",
} as const;

const collectionCardStyle = {
  height: "100%",
  padding: "1.25rem 1.35rem",
  borderRadius: "var(--mw-radius)",
  background: "#fff",
  border: "1px solid rgba(13, 105, 94, 0.18)",
  boxShadow: "0 12px 30px rgba(16, 44, 40, 0.08)",
  display: "grid",
  gap: "0.9rem",
} as const;

function formatRuDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

function collectionCatalogHref(c: { discipline: string | null; region: string | null; season: string | null }): string {
  const p = new URLSearchParams();
  const discipline = exploreNavLinkFromRaw("discipline", c.discipline);
  const region = exploreNavLinkFromRaw("region", c.region);
  const season = exploreNavLinkFromRaw("season", c.season);
  if (discipline) p.set("discipline", discipline.label);
  if (region) p.set("region", region.label);
  if (season) p.set("season", season.slug);
  const q = p.toString();
  return `/${q ? `?${q}` : ""}#programs`;
}

function collectionMeta(c: { discipline: string | null; region: string | null; season: string | null; tags: string[] }): string[] {
  return [c.discipline, c.region, c.season, ...c.tags.slice(0, 2)].filter((v): v is string => Boolean(v?.trim()));
}

export default async function CollectionsIndexPage() {
  const siteUrl = getPublicSiteUrl();
  let list: Awaited<ReturnType<typeof fetchPublicCollectionList>> | null = null;
  let err: string | null = null;
  try {
    list = await fetchPublicCollectionList();
  } catch (e) {
    err = e instanceof Error ? e.message : "error";
  }
  const items = list?.items ?? [];

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem" }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>
          Главная
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>Подборки</span>
      </nav>
      <section
        style={hubHeroStyle}
      >
        <p style={{ margin: "0 0 0.55rem", color: "#3f625e", fontWeight: 800 }}>
          Маршруты выбора
        </p>
        <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "1rem", fontSize: "clamp(1.75rem, 4vw, 2.35rem)" }}>
          Подборки MyWaveTour
        </h1>
        <p style={{ color: "#385a56", maxWidth: "72ch", lineHeight: 1.65, margin: "0 0 1.25rem" }}>
          {COL_DESC} Каждая подборка ведёт к связанным программам, статьям и организаторам, а кнопка каталога сразу применяет подходящие фильтры.
        </p>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <Link href="/#programs" className="mw-btn mw-btn--primary">
            Смотреть все выезды
          </Link>
          <Link href="/explore" className="mw-btn mw-btn--ghost">
            Темы и направления
          </Link>
        </p>
      </section>
      {err && (
        <p role="alert" style={{ color: "crimson" }}>
          Не удалось загрузить подборки. Попробуйте обновить страницу позже.
        </p>
      )}
      {items.length === 0 && !err ? (
        <div className="mw-empty-state">
          <h2>Подборки скоро появятся</h2>
          <p>Пока нет опубликованных подборок. Откройте каталог, чтобы выбрать актуальную программу по дисциплине, региону или дате.</p>
          <Link href="/#programs" className="mw-btn mw-btn--primary">
            Найти выезд в каталоге
          </Link>
        </div>
      ) : null}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: "1.25rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
        }}
      >
        {items.map((c) => (
          <li key={c.id}>
            <article
              style={collectionCardStyle}
            >
              <div>
                <p style={{ fontSize: "0.9rem", color: "#58706d", margin: 0 }}>{formatRuDate(c.publishedAt)}</p>
                <h2 style={{ margin: "0.35rem 0 0.5rem", fontSize: "1.2rem", lineHeight: 1.3 }}>
                  <Link href={`/collections/${encodeURIComponent(c.slug)}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {c.resolved.seoTitle}
                  </Link>
                </h2>
                {c.description ? <p style={{ margin: 0, color: "#4a625f", lineHeight: 1.55 }}>{c.description}</p> : null}
              </div>
              {collectionMeta(c).length > 0 ? (
                <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {collectionMeta(c).map((label) => (
                    <span
                      key={label}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 9px",
                        borderRadius: 999,
                        background: "var(--mw-accent-soft)",
                        color: "var(--mw-accent-hover)",
                        fontWeight: 700,
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </p>
              ) : null}
              <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.55rem", alignSelf: "end" }}>
                <Link href={`/collections/${encodeURIComponent(c.slug)}`} className="mw-btn mw-btn--primary" style={{ fontSize: "0.92rem" }}>
                  Открыть подборку
                </Link>
                <Link href={collectionCatalogHref(c)} className="mw-btn mw-btn--ghost" style={{ fontSize: "0.92rem" }}>
                  В каталог
                </Link>
              </p>
            </article>
          </li>
        ))}
      </ul>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Подборки MyWaveTour",
            url: `${siteUrl}/collections`,
            description: COL_DESC,
            inLanguage: "ru-RU",
          }),
        }}
      />
    </div>
  );
}
