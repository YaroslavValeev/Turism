import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogBreadcrumbJsonLd } from "../../blog/BlogJsonLd";
import { fetchPublicCollection } from "../../../lib/collectionsApi";
import { fetchPublicExploreList } from "../../../lib/exploreApi";
import { getPublicSiteUrl } from "../../../lib/siteUrl";
import { CollectionExploreLinksBlock } from "../collection-explore-links";
import { CollectionPageCta } from "../collection-page-cta";
import { CollectionPageJsonLd } from "../CollectionJsonLd";
import { CollectionRelatedBlocks } from "../collection-related-blocks";

type Props = { params: Promise<{ slug: string }> };

function formatBody(text: string | null) {
  if (!text?.trim()) return null;
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ maxWidth: "68ch" }}>
      {blocks.map((para, i) => (
        <p key={i} style={{ margin: "0 0 1rem", lineHeight: 1.65 }}>
          {para}
        </p>
      ))}
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  let c: Awaited<ReturnType<typeof fetchPublicCollection>>;
  try {
    c = await fetchPublicCollection(slug);
  } catch {
    return { title: "Подборка" };
  }
  if (!c) return { title: "Не найдено" };
  const r = c.resolved;
  return {
    title: r.seoTitle,
    description: r.seoDescription,
    alternates: { canonical: r.canonicalUrl },
    openGraph: {
      title: r.seoTitle,
      description: r.seoDescription,
      type: "website",
      url: r.canonicalUrl,
      siteName: "MyWaveTour",
      images: [{ url: r.ogImage, alt: r.seoTitle }],
    },
    twitter: { card: "summary_large_image", title: r.seoTitle, description: r.seoDescription, images: [r.ogImage] },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const [c, exploreIndex] = await Promise.all([fetchPublicCollection(slug), fetchPublicExploreList()]);
  if (!c) notFound();
  const siteUrl = getPublicSiteUrl();
  const path = `/collections/${encodeURIComponent(c.slug)}`;
  const r = c.resolved;

  return (
    <div className="mw-container">
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>
          Главная
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <Link href="/collections" style={{ color: "var(--mw-accent)" }}>
          Подборки
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>{c.title}</span>
      </nav>

      {c.discipline || c.region || c.season ? (
        <p style={{ fontSize: "0.9rem", color: "var(--mw-muted2)", marginBottom: 8 }}>
          {[c.discipline, c.region, c.season].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "1rem", fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
        {c.title}
      </h1>
      {c.tags.length > 0 && (
        <p style={{ margin: "0 0 1rem", display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {c.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: "0.82rem",
                padding: "4px 10px",
                borderRadius: 999,
                background: "var(--mw-accent-soft)",
                color: "var(--mw-accent-hover)",
              }}
            >
              {t}
            </span>
          ))}
        </p>
      )}
      {c.description ? <p style={{ color: "var(--mw-muted)", maxWidth: "68ch", marginBottom: "1rem" }}>{c.description}</p> : null}
      {formatBody(c.body)}

      <CollectionExploreLinksBlock
        collectionId={c.id}
        exploreIndex={exploreIndex}
        discipline={c.discipline}
        region={c.region}
        season={c.season}
      />

      <CollectionRelatedBlocks slug={c.slug} collectionSlug={c.slug} collectionId={c.id} />

      <CollectionPageCta collectionSlug={c.slug} collectionId={c.id} />

      <CollectionPageJsonLd name={r.seoTitle} description={r.seoDescription} url={r.canonicalUrl} image={r.ogImage} />
      <BlogBreadcrumbJsonLd
        siteUrl={siteUrl}
        items={[
          { name: "Главная", path: "/" },
          { name: "Подборки", path: "/collections" },
          { name: r.seoTitle, path },
        ]}
      />
    </div>
  );
}
