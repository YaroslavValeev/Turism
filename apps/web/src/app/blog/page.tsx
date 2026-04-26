import type { Metadata } from "next";
import Link from "next/link";
import { fetchPublicBlogList } from "../../lib/blogApi";
import { getPublicSiteUrl } from "../../lib/siteUrl";

const BLOG_INDEX_DESC = "Публикации блога MyWaveTour о кэмпах, программах и спортивных выездах.";

export const metadata: Metadata = {
  title: "Блог",
  description: BLOG_INDEX_DESC,
  openGraph: {
    title: "Блог MyWaveTour",
    description: "Публикации о кэмпах, программах и спортивных выездах по России.",
    type: "website",
  },
  alternates: { canonical: "/blog" },
};

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

export default async function BlogIndexPage() {
  const siteUrl = getPublicSiteUrl();
  let list: Awaited<ReturnType<typeof fetchPublicBlogList>> | null = null;
  let error: string | null = null;
  try {
    list = await fetchPublicBlogList({ limit: 48 });
  } catch (e) {
    error = e instanceof Error ? e.message : "load error";
  }

  const items = list?.items ?? [];

  return (
    <div className="mw-container">
      <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "clamp(1.75rem, 4vw, 2.25rem)" }}>
        Блог MyWave
      </h1>
      <p style={{ color: "var(--mw-muted)", maxWidth: "62ch", marginBottom: "2rem" }}>
        Материалы из контент-конвейера: новости федераций, кэмпы, подборки направлений. Далее — программы и заявка
        организатору.
      </p>

      {error ? (
        <p role="alert" style={{ color: "crimson" }}>
          Не удалось загрузить публикации ({error}). Проверьте API и переменную API_INTERNAL_BASE_URL / NEXT_PUBLIC_API_URL.
        </p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--mw-muted)" }}>Пока нет опубликованных записей. Загляните позже или откройте каталог программ на главной.</p>
      ) : (
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
          {items.map((post) => (
            <li key={post.id}>
              <article
                style={{
                  height: "100%",
                  padding: "1.25rem 1.35rem",
                  borderRadius: "var(--mw-radius)",
                  background: "var(--mw-surface)",
                  border: "1px solid var(--mw-border)",
                  boxShadow: "var(--mw-shadow)",
                }}
              >
                <time dateTime={post.publishedAt} style={{ fontSize: "0.9rem", color: "var(--mw-muted2)" }}>
                  {formatRuDate(post.publishedAt)}
                </time>
                <h2 style={{ margin: "0.5rem 0 0.75rem", fontSize: "1.15rem", lineHeight: 1.35 }}>
                  <Link href={`/blog/${encodeURIComponent(post.slug)}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {post.resolved.seoTitle}
                  </Link>
                </h2>
                {post.tags.length > 0 && (
                  <p style={{ margin: "0 0 0.5rem", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {post.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{ fontSize: "0.78rem", color: "var(--mw-muted2)" }}>
                        #{t}
                      </span>
                    ))}
                  </p>
                )}
                {(post.excerpt || post.resolved.seoDescription) && (
                  <p style={{ margin: 0, color: "var(--mw-muted)", fontSize: "0.98rem", lineHeight: 1.55 }}>
                    {post.excerpt?.trim() || post.resolved.seoDescription}
                  </p>
                )}
                <p style={{ margin: "1rem 0 0" }}>
                  <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="mw-btn mw-btn--primary" style={{ fontSize: "0.95rem" }}>
                    Читать
                  </Link>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Блог MyWaveTour",
            url: `${siteUrl}/blog`,
            description: BLOG_INDEX_DESC,
            inLanguage: "ru-RU",
            publisher: { "@type": "Organization", name: "MyWaveTour", url: siteUrl },
          }),
        }}
      />
    </div>
  );
}
