type LinkItem = { label: string; href: string };

function resolveFooterHref(href: string): string {
  const raw = href.trim();
  if (!raw) return "/";
  // Якоря футера должны работать с любой страницы, поэтому ведём на главную.
  if (raw.startsWith("#")) return `/${raw}`;
  return raw;
}

export function LandingFooter({
  brand,
  tagline,
  links,
}: {
  brand: string;
  tagline: string;
  links: LinkItem[];
}) {
  return (
    <footer className="footer-mw">
      <div className="mw-container">
        <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--mw-text)" }}>{brand}</p>
        <p style={{ margin: "0 0 20px", maxWidth: "62ch" }}>{tagline}</p>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px" }}>
          {links.map((l) => (
            <a key={l.label} href={resolveFooterHref(l.href)}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
