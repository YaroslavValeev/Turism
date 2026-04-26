import Link from "next/link";

export function CollectionsShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--mw-surface)",
          borderBottom: "1px solid var(--mw-border)",
          padding: "14px 0",
        }}
      >
        <div className="mw-container" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px 20px" }}>
          <Link href="/" style={{ fontWeight: 700, color: "var(--mw-text)", textDecoration: "none" }}>
            MyWaveTour
          </Link>
          <span style={{ color: "var(--mw-muted2)" }} aria-hidden>
            /
          </span>
          <Link href="/collections" style={{ fontWeight: 600, color: "var(--mw-accent)", textDecoration: "none" }}>
            Подборки
          </Link>
        </div>
      </header>
      <main style={{ flex: 1, padding: "clamp(1.5rem, 4vw, 2.5rem) 0" }}>{children}</main>
    </div>
  );
}
