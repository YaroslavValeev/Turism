export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mw-admin-empty" style={{ marginTop: 8, marginBottom: 8 }}>
      <p style={{ margin: 0, fontWeight: 750, fontSize: "1.02rem", color: "var(--mw-text)" }}>{title}</p>
      {description ? <p className="mw-admin-prose" style={{ margin: "10px 0 0", maxWidth: 36 * 16 }}>{description}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
