type Card = { title: string; text: string };

export function TrustBar({ cards }: { cards: Card[] }) {
  return (
    <div className="trust-grid">
      {cards.map((c) => (
        <div key={c.title} className="mw-card">
          <span className="mw-badge mw-badge--trust" style={{ marginBottom: 10 }}>
            {c.title}
          </span>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--mw-muted)" }}>{c.text}</p>
        </div>
      ))}
    </div>
  );
}
