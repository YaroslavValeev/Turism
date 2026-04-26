import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { blogDescriptionFallback, fetchPublicBlogPost } from "../../../lib/blogApi";
import { fetchPublicExploreList } from "../../../lib/exploreApi";
import { getPublicSiteUrl } from "../../../lib/siteUrl";
import { BlogExploreLinksBlock } from "../blog-explore-links";
import { BlogArticleCta } from "../blog-article-cta";
import { BlogRelatedSections } from "../blog-related-sections";
import { BlogArticleJsonLd, BlogBreadcrumbJsonLd } from "../BlogJsonLd";

type Props = { params: { slug: string } };

function formatRuDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

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
  const slug = decodeURIComponent(params.slug);
  let post: Awaited<ReturnType<typeof fetchPublicBlogPost>> | null;
  try {
    post = await fetchPublicBlogPost(slug);
  } catch {
    return { title: "Материал" };
  }
  if (!post) {
    return { title: "Не найдено" };
  }
  const r = post.resolved;
  const title = r.seoTitle;
  const description = r.seoDescription;
  return {
    title,
    description,
    alternates: { canonical: r.canonicalUrl },
    openGraph: {
      title,
      description,
      type: "article",
      url: r.canonicalUrl,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      siteName: "MyWaveTour",
      images: [{ url: r.ogImage, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [r.ogImage],
    },
  };
}

export default async function BlogArticlePage({ params }: Props) {
  const slug = decodeURIComponent(params.slug);
  const [post, exploreIndex] = await Promise.all([fetchPublicBlogPost(slug), fetchPublicExploreList()]);
  if (!post) notFound();

  const siteUrl = getPublicSiteUrl();
  const path = `/blog/${encodeURIComponent(post.slug)}`;
  const r = post.resolved;
  const jsonLdDescription = r.seoDescription;
  const fallbackDesc = blogDescriptionFallback(post.excerpt, post.body, post.title);

  return (
    <div className="mw-container">
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>
          Главная
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <Link href="/blog" style={{ color: "var(--mw-accent)" }}>
          Блог
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>{post.title}</span>
      </nav>

      <article itemScope itemType="https://schema.org/Article">
        <meta itemProp="headline" content={r.seoTitle} />
        <meta itemProp="datePublished" content={post.publishedAt} />
        <meta itemProp="dateModified" content={post.updatedAt} />
        {r.ogImage ? <meta itemProp="image" content={r.ogImage} /> : null}
        <time dateTime={post.publishedAt} style={{ fontSize: "0.95rem", color: "var(--mw-muted2)" }}>
          {formatRuDate(post.publishedAt)}
        </time>
        <h1 className="mw-h1" style={{ marginTop: "0.35rem", marginBottom: "0.75rem", fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
          {post.title}
        </h1>
        {post.tags.length > 0 && (
          <p style={{ margin: "0 0 1rem", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {post.tags.map((t) => (
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
        {formatBody(post.body)}
        {post.sourceUrl ? (
          <p style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
            <span style={{ color: "var(--mw-muted)" }}>Источник: </span>
            <a href={post.sourceUrl} rel="noopener noreferrer" target="_blank">
              {post.sourceUrl}
            </a>
          </p>
        ) : null}
      </article>

      <BlogExploreLinksBlock
        postId={post.id}
        exploreIndex={exploreIndex}
        discipline={post.discipline}
        region={post.region}
      />

      <BlogRelatedSections slug={post.slug} postId={post.id} />

      <BlogArticleCta postId={post.id} />

      <BlogArticleJsonLd
        siteUrl={siteUrl}
        path={path}
        headline={r.seoTitle}
        description={jsonLdDescription || fallbackDesc}
        publishedAt={post.publishedAt}
        updatedAt={post.updatedAt}
        canonicalUrl={r.canonicalUrl}
        imageUrl={r.ogImage}
      />
      <BlogBreadcrumbJsonLd
        siteUrl={siteUrl}
        items={[
          { name: "Главная", path: "/" },
          { name: "Блог", path: "/blog" },
          { name: r.seoTitle, path },
        ]}
      />
    </div>
  );
}
