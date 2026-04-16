type LinkItem = { label: string; href: string };

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
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
