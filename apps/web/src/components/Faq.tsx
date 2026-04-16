export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p style={{ margin: 0, color: "var(--mw-muted)", fontSize: "0.95rem" }}>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
