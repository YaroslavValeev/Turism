import Link from "next/link";
import { getProgramLevelLabel } from "@mywave/shared-types";
import { ProgramCard, type ProgramCardProgram } from "../../components/ProgramCard";
import {
  fetchPublicBlogRelated,
  type PublicBlogRelated,
  type PublicOrganizerRelated,
  type PublicProgramRelated,
} from "../../lib/blogApi";
import { buildInternalContentQuery } from "../../lib/internalContentUtm";

type Props = { slug: string; postId: string };

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

export async function BlogRelatedSections({ slug, postId }: Props) {
  let data: PublicBlogRelated | null = null;
  try {
    data = await fetchPublicBlogRelated(slug);
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <p style={{ color: "var(--mw-muted)", marginTop: "2rem" }}>Блоки подборок временно недоступны. Обновите страницу позже.</p>
    );
  }

  const entryQ = buildInternalContentQuery("blog", postId);

  return (
    <div style={{ marginTop: "2.5rem", display: "grid", gap: "2.5rem" }}>
      {data.programs.length > 0 && (
        <section aria-labelledby="blog-related-programs">
          <h2 id="blog-related-programs" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Связанные программы
          </h2>
          <div
            style={{
              display: "grid",
              gap: "1.25rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
            }}
          >
            {data.programs.map((p) => (
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

      {data.collections.length > 0 && (
        <section aria-labelledby="blog-related-collections">
          <h2 id="blog-related-collections" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Подборки
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.85rem" }}>
            {data.collections.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${encodeURIComponent(c.slug)}?${entryQ}`} style={{ fontWeight: 600 }}>
                  {c.title}
                </Link>
                {c.description ? (
                  <span style={{ display: "block", color: "var(--mw-muted)", fontSize: "0.95rem", marginTop: 4 }}>{c.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.organizers.length > 0 && (
        <section aria-labelledby="blog-related-organizers">
          <h2 id="blog-related-organizers" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Организатор
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
            {data.organizers.map((o: PublicOrganizerRelated) => (
              <li
                key={o.id}
                style={{
                  padding: "1rem 1.15rem",
                  borderRadius: "var(--mw-radius)",
                  border: "1px solid var(--mw-border)",
                  background: "var(--mw-surface)",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>{o.displayName}</p>
                {o.legalStatus ? <p style={{ margin: "0.35rem 0 0", color: "var(--mw-muted)", fontSize: "0.92rem" }}>{o.legalStatus}</p> : null}
                <p style={{ margin: "0.75rem 0 0" }}>
                  <Link href={`/?${entryQ}#programs`} className="mw-btn mw-btn--ghost" style={{ fontSize: "0.95rem" }} prefetch={false}>
                    Смотреть программы в каталоге
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.similarPosts.length > 0 && (
        <section aria-labelledby="blog-similar">
          <h2 id="blog-similar" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Похожие статьи
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
            {data.similarPosts.map((s: PublicBlogRelated["similarPosts"][number]) => (
              <li key={s.id}>
                <Link href={`/blog/${encodeURIComponent(s.slug)}?${entryQ}`} style={{ fontWeight: 600 }}>
                  {s.title}
                </Link>
                {s.excerpt ? <span style={{ display: "block", color: "var(--mw-muted)", fontSize: "0.95rem", marginTop: 4 }}>{s.excerpt}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
