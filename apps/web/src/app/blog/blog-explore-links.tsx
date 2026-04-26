import Link from "next/link";
import { exploreHubKey, exploreNavLinkFromRaw, type ExploreNavLink } from "@mywave/explore-links";
import { buildInternalContentQuery } from "../../lib/internalContentUtm";
import { pickSimilarExploreHubs, validExploreMainLinks, buildValidHubKeySetFromExploreIndex } from "../../lib/exploreNavWeb";
import type { ExploreListItem } from "../../lib/exploreApi";

type Props = {
  postId: string;
  discipline: string | null;
  region: string | null;
  exploreIndex: ExploreListItem[];
};

function lineLabel(l: ExploreNavLink): string {
  if (l.type === "discipline") return `Все ${l.label.toLowerCase()}-кэмпы →`;
  if (l.type === "region") return `Поездки на ${l.label} →`;
  return `Все поездки в сезон ${l.label.toLowerCase()} →`;
}

export function BlogExploreLinksBlock({ postId, discipline, region, exploreIndex }: Props) {
  const valid = buildValidHubKeySetFromExploreIndex(exploreIndex);
  const d = exploreNavLinkFromRaw("discipline", discipline);
  const r = exploreNavLinkFromRaw("region", region);
  const main = validExploreMainLinks([d, r], valid);
  const used = new Set<string>(main.map((l) => exploreHubKey(l.type, l.slug)));
  const similar = pickSimilarExploreHubs(
    exploreIndex,
    used,
    4,
  );

  if (main.length === 0 && similar.length === 0) return null;

  const q = (extra?: Record<string, string>) => buildInternalContentQuery("blog", postId, extra);

  return (
    <section
      className="mw-container"
      style={{
        marginTop: "2rem",
        padding: "1.25rem 1.35rem",
        borderRadius: "var(--mw-radius-lg)",
        background: "var(--mw-surface-elevated, var(--mw-surface))",
        border: "1px solid var(--mw-border)",
      }}
    >
      <h2 className="mw-h2" style={{ marginTop: 0, fontSize: "1.15rem", marginBottom: "0.75rem" }}>
        Темы и направления
      </h2>
      {main.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", display: "grid", gap: "0.5rem" }}>
          {main.map((l) => (
            <li key={exploreHubKey(l.type, l.slug)}>
              <Link
                href={`${l.path}?${q()}`}
                style={{ color: "var(--mw-accent)", fontWeight: 600 }}
              >
                {lineLabel(l)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {similar.length > 0 && (
        <>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.92rem", color: "var(--mw-muted2)" }}>Похожие темы</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
            {similar.map((it) => (
              <li key={exploreHubKey(it.type, it.slug)}>
                <Link
                  href={`/explore/${it.type}/${encodeURIComponent(it.slug)}?${q()}`}
                  style={{ color: "var(--mw-accent)", fontSize: "0.95rem" }}
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
