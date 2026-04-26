export function AdminStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mw-admin-stat-card mw-admin-card">
      <div className="mw-admin-stat-card__label">{label}</div>
      <div className="mw-admin-stat-card__value">{value}</div>
      {hint ? <div className="mw-admin-stat-card__hint">{hint}</div> : null}
    </div>
  );
}

export function AdminStatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mw-admin-stat-grid">{children}</div>;
}
