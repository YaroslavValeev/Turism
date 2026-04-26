import type { Metadata } from "next";
import Link from "next/link";
import { fetchPublicCollectionList } from "../../lib/collectionsApi";
import { getPublicSiteUrl } from "../../lib/siteUrl";

const COL_DESC = "Тематические подборки: программы, статьи и организаторы в одном маршруте к заявке.";

export const metadata: Metadata = {
  title: "Подборки",
  description: COL_DESC,
  openGraph: { title: "Подборки", description: COL_DESC, type: "website" },
  alternates: { canonical: "/collections" },
};

function formatRuDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
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
    <div className="mw-container">
      <h1 className="mw-h1" style={{ marginTop: 0, fontSize: "clamp(1.75rem, 4vw, 2.25rem)" }}>
        Подборки
      </h1>
      <p style={{ color: "var(--mw-muted)", maxWidth: "62ch", marginBottom: "2rem" }}>{COL_DESC}</p>
      {err && <p style={{ color: "crimson" }}>Не удалось загрузить: {err}</p>}
      {items.length === 0 && !err ? <p style={{ color: "var(--mw-muted)" }}>Пока нет опубликованных подборок.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1.25rem" }}>
        {items.map((c) => (
          <li key={c.id}>
            <article
              style={{
                padding: "1.25rem 1.35rem",
                borderRadius: "var(--mw-radius)",
                background: "var(--mw-surface)",
                border: "1px solid var(--mw-border)",
                boxShadow: "var(--mw-shadow)",
              }}
            >
              <p style={{ fontSize: "0.9rem", color: "var(--mw-muted2)", margin: 0 }}>{formatRuDate(c.publishedAt)}</p>
              <h2 style={{ margin: "0.35rem 0 0.5rem", fontSize: "1.2rem" }}>
                <Link href={`/collections/${encodeURIComponent(c.slug)}`} style={{ color: "inherit", textDecoration: "none" }}>
                  {c.resolved.seoTitle}
                </Link>
              </h2>
              {c.description ? <p style={{ margin: 0, color: "var(--mw-muted)" }}>{c.description}</p> : null}
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
