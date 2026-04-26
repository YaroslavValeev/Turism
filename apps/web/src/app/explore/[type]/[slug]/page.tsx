import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProgramLevelLabel } from "@mywave/shared-types";
import { BlogBreadcrumbJsonLd } from "../../../blog/BlogJsonLd";
import { CollectionPageJsonLd } from "../../../collections/CollectionJsonLd";
import { ProgramCard, type ProgramCardProgram } from "../../../../components/ProgramCard";
import type { PublicProgramRelated } from "../../../../lib/blogApi";
import { exploreHubKey } from "@mywave/explore-links";
import { fetchPublicExploreHub, fetchPublicExploreList } from "../../../../lib/exploreApi";
import { pickSimilarExploreHubs } from "../../../../lib/exploreNavWeb";
import { getPublicSiteUrl } from "../../../../lib/siteUrl";
import { buildInternalContentQuery } from "../../../../lib/internalContentUtm";
import { ExplorePageCta } from "../../explore-page-cta";
import type { ExploreHubType } from "../../../../lib/exploreApi";

const VALID_TYPES = new Set<string>(["discipline", "region", "season"]);

type Props = { params: { type: string; slug: string } };

function mapProgram(p: PublicProgramRelated): ProgramCardProgram {
  return {
    id: p.id,
    title: p.title,
    discipline: p.discipline,
    region: p.region,
    exactLocation: p.exactLocation,
    startDate: p.startDate,
    endDate: p.endDate,
    durationDays: p.durationDays,
    priceFromRub: p.priceFromRub,
    levelRequired: p.levelRequired,
    audienceFit: p.audienceFit,
    riskLevel: p.riskLevel,
    autoPublished: p.autoPublished,
    sourceType: p.sourceType,
    reviewStatus: p.reviewStatus,
    organizer: p.organizer,
    media: p.media,
  };
}

function typeLineRu(t: ExploreHubType): string {
  switch (t) {
    case "discipline":
      return "Направление (дисциплина)";
    case "region":
      return "Регион";
    case "season":
      return "Сезон";
    default:
      return t;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const type = String(params.type || "").trim();
  const slug = decodeURIComponent(String(params.slug || "")).trim();
  if (!VALID_TYPES.has(type) || !slug) return { title: "Тема" };
  const hub = await fetchPublicExploreHub(type, slug);
  if (!hub) return { title: "Не найдено" };
  const r = hub.resolved;
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

export default async function ExploreHubPage({ params }: Props) {
  const type = String(params.type || "").trim() as ExploreHubType;
  const slug = decodeURIComponent(String(params.slug || "")).trim();
  if (!VALID_TYPES.has(type) || !slug) notFound();

  const [hub, exploreIndex] = await Promise.all([fetchPublicExploreHub(type, slug), fetchPublicExploreList()]);
  if (!hub) notFound();

  const siteUrl = getPublicSiteUrl();
  const r = hub.resolved;
  const path = `/explore/${type}/${encodeURIComponent(hub.slug)}`;
  const entryQ = buildInternalContentQuery("explore", `${type}:${hub.slug}`, {
    explore_type: type,
    explore_slug: hub.slug,
  });
  const otherHubs = pickSimilarExploreHubs(
    exploreIndex,
    new Set([exploreHubKey(hub.type, hub.slug)]),
    6,
  );

  const breadJson = [
    { name: "Главная", path: "/" },
    { name: "Темы", path: "/explore" },
    { name: hub.label, path },
  ];

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem" }}>
      <BlogBreadcrumbJsonLd siteUrl={siteUrl} items={breadJson} />
      <CollectionPageJsonLd
        name={r.seoTitle}
        description={r.seoDescription}
        url={r.canonicalUrl}
        image={r.ogImage}
      />
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>
          Главная
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <Link href="/explore" style={{ color: "var(--mw-accent)" }}>
          Темы
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>{hub.label}</span>
      </nav>
      <p style={{ fontSize: "0.9rem", color: "var(--mw-muted2)", marginBottom: 8 }}>{typeLineRu(hub.type)}</p>
      <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "1rem", fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
        {hub.label}-кэмпы и поездки
      </h1>
      <p style={{ color: "var(--mw-muted)", maxWidth: "68ch", lineHeight: 1.65, marginBottom: "2rem" }}>
        Актуальные программы, подборки и статьи по теме. {r.seoDescription} Всего публичных материалов: {hub.counts.total} (статьи: {hub.counts.blogPosts}, программы:{" "}
        {hub.counts.programs}, подборки: {hub.counts.collections}).
      </p>

      {hub.programs.length > 0 && (
        <section aria-labelledby="ex-prog" style={{ marginBottom: "2.5rem" }}>
          <h2 id="ex-prog" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Программы
          </h2>
          <div
            style={{
              display: "grid",
              gap: "1.25rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
            }}
          >
            {hub.programs.map((p) => (
              <ProgramCard
                key={p.id}
                program={mapProgram(p)}
                levelLabel={getProgramLevelLabel(p.levelRequired)}
                programHrefQuery={entryQ}
              />
            ))}
          </div>
        </section>
      )}

      {hub.collections.length > 0 && (
        <section aria-labelledby="ex-col" style={{ marginBottom: "2.5rem" }}>
          <h2 id="ex-col" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Подборки
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
            {hub.collections.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${encodeURIComponent(c.slug)}?${entryQ}`} style={{ color: "var(--mw-accent)", fontWeight: 600 }}>
                  {c.title}
                </Link>
                {c.description ? (
                  <p style={{ margin: "0.25rem 0 0", color: "var(--mw-muted)", fontSize: "0.95rem" }}>{c.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hub.blogPosts.length > 0 && (
        <section aria-labelledby="ex-blog" style={{ marginBottom: "2.5rem" }}>
          <h2 id="ex-blog" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Статьи
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
            {hub.blogPosts.map((b) => (
              <li key={b.id}>
                <Link href={`/blog/${encodeURIComponent(b.slug)}?${entryQ}`} style={{ color: "var(--mw-accent)", fontWeight: 600 }}>
                  {b.title}
                </Link>
                {b.excerpt ? (
                  <p style={{ margin: "0.25rem 0 0", color: "var(--mw-muted)", fontSize: "0.95rem" }}>{b.excerpt}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {otherHubs.length > 0 && (
        <section aria-labelledby="ex-more" style={{ marginBottom: "2.5rem" }}>
          <h2 id="ex-more" className="mw-h2" style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
            Другие темы и направления
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem" }}>
            {otherHubs.map((h) => (
              <li key={exploreHubKey(h.type, h.slug)}>
                <Link
                  href={`/explore/${h.type}/${encodeURIComponent(h.slug)}?${buildInternalContentQuery("explore", `${h.type}:${h.slug}`)}`}
                  style={{ color: "var(--mw-accent)" }}
                >
                  {h.label} <span style={{ color: "var(--mw-muted2)", fontSize: "0.85rem" }}>({h.type})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ExplorePageCta exploreType={type} exploreSlug={hub.slug} />
    </div>
  );
}
