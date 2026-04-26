import Link from "next/link";
import { exploreHubKey, exploreNavLinkFromRaw } from "@mywave/explore-links";
import { buildInternalContentQuery } from "../../lib/internalContentUtm";
import { buildValidHubKeySetFromExploreIndex, validExploreMainLinks } from "../../lib/exploreNavWeb";
import type { ExploreListItem } from "../../lib/exploreApi";

type Props = {
  collectionId: string;
  discipline: string | null;
  region: string | null;
  season: string | null;
  exploreIndex: ExploreListItem[];
};

function lineLabel(t: "discipline" | "region" | "season"): string {
  if (t === "discipline") return "Все материалы по дисциплине";
  if (t === "region") return "Все материалы по региону";
  return "Все по сезону";
}

export function CollectionExploreLinksBlock({ collectionId, discipline, region, season, exploreIndex }: Props) {
  const valid = buildValidHubKeySetFromExploreIndex(exploreIndex);
  const links = validExploreMainLinks(
    [
      exploreNavLinkFromRaw("discipline", discipline),
      exploreNavLinkFromRaw("region", region),
      exploreNavLinkFromRaw("season", season),
    ],
    valid,
  );

  if (links.length === 0) return null;

  const q = buildInternalContentQuery("collection", collectionId);

  return (
    <section
      className="mw-container"
      style={{
        marginTop: "1.5rem",
        marginBottom: "0.5rem",
        padding: "1.25rem 1.35rem",
        borderRadius: "var(--mw-radius-lg)",
        background: "var(--mw-surface-elevated, var(--mw-surface))",
        border: "1px solid var(--mw-border)",
      }}
    >
      <h2 className="mw-h2" style={{ marginTop: 0, fontSize: "1.15rem", marginBottom: "0.75rem" }}>
        Лучшие кэмпы по теме
      </h2>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "var(--mw-muted)" }}>
        Тематические SEO-страницы: статьи, подборки и программы в одном срезе.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
        {links.map((l) => (
          <li key={exploreHubKey(l.type, l.slug)}>
            <Link href={`${l.path}?${q}`} style={{ color: "var(--mw-accent)", fontWeight: 600 }}>
              {lineLabel(l.type)} — {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
