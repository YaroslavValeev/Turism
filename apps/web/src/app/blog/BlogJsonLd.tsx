type ArticleProps = {
  siteUrl: string;
  path: string;
  /** Заголовок в schema (предпочтительно = SEO title) */
  headline: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  /** Полный canonical URL, если задан в блоге */
  canonicalUrl?: string;
  imageUrl?: string;
};

export function BlogArticleJsonLd({
  siteUrl,
  path,
  headline,
  description,
  publishedAt,
  updatedAt,
  canonicalUrl,
  imageUrl,
}: ArticleProps) {
  const base = siteUrl.replace(/\/+$/, "");
  const defaultUrl = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const url = (canonicalUrl?.trim() || defaultUrl).trim();
  const org = {
    "@type": "Organization" as const,
    name: "MyWaveTour",
    url: base,
    logo: { "@type": "ImageObject" as const, url: `${base}/favicon.svg` },
  };
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description: description.slice(0, 5000),
    datePublished: publishedAt,
    dateModified: updatedAt,
    inLanguage: "ru-RU",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: org,
    publisher: org,
  };
  if (imageUrl?.trim()) {
    article.image = imageUrl.trim();
  }
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
    />
  );
}

export function BlogBreadcrumbJsonLd({
  siteUrl,
  items,
}: {
  siteUrl: string;
  items: { name: string; path: string }[];
}) {
  const base = siteUrl.replace(/\/+$/, "");
  const itemListElement = items.map((it, i) => ({
    "@type": "ListItem" as const,
    position: i + 1,
    name: it.name,
    item: `${base}${it.path.startsWith("/") ? it.path : `/${it.path}`}`,
  }));
  const data = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
