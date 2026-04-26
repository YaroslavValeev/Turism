import Link from "next/link";
import { getProgramLevelLabel } from "@mywave/shared-types";
import { ProgramCard, type ProgramCardProgram } from "../../components/ProgramCard";
import type { PublicProgramRelated } from "../../lib/blogApi";
import { fetchPublicCollectionRelated, type PublicCollectionRelated } from "../../lib/collectionsApi";
import { buildCollectionUtmQuery } from "../../lib/utm";

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

type Props = {
  slug: string;
  collectionSlug: string;
  collectionId: string;
};

export async function CollectionRelatedBlocks({ slug, collectionSlug, collectionId }: Props) {
  let data: PublicCollectionRelated | null = null;
  try {
    data = await fetchPublicCollectionRelated(slug);
  } catch {
    data = null;
  }
  if (!data) {
    return <p style={{ color: "var(--mw-muted)" }}>Не удалось загрузить связанные материалы.</p>;
  }
  const p = new URLSearchParams(buildCollectionUtmQuery(collectionSlug, collectionId));
  p.set("utm_source", "internal");
  p.set("utm_medium", "content");
  p.set("entry_type", "collection");
  p.set("entry_id", collectionId);
  const utm = p.toString();

  return (
    <div style={{ display: "grid", gap: "2.5rem", marginTop: "2rem" }}>
      {data.programs.length > 0 && (
        <section aria-labelledby="coll-prog">
          <h2 id="coll-prog" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Программы в подборке
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
                programHrefQuery={utm}
              />
            ))}
          </div>
        </section>
      )}

      {data.blogPosts.length > 0 && (
        <section aria-labelledby="coll-blog">
          <h2 id="coll-blog" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Материалы
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
            {data.blogPosts.map((b) => (
              <li key={b.id}>
                <Link href={`/blog/${encodeURIComponent(b.slug)}?${utm}`} style={{ fontWeight: 600 }}>
                  {b.title}
                </Link>
                {b.excerpt ? (
                  <span style={{ display: "block", color: "var(--mw-muted)", fontSize: "0.95rem", marginTop: 4 }}>{b.excerpt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.organizers.length > 0 && (
        <section aria-labelledby="coll-org">
          <h2 id="coll-org" className="mw-h2" style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Организаторы
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
            {data.organizers.map((o) => (
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
                  <Link href={`/?${utm}#programs`} className="mw-btn mw-btn--ghost" style={{ fontSize: "0.95rem" }} prefetch={false}>
                    Программы в каталоге
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
