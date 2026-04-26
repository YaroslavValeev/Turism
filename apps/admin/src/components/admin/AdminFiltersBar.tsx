export function AdminFiltersBar({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mw-admin-filters-bar mw-admin-card">
      {title ? <div className="mw-admin-filters-bar__title">{title}</div> : null}
      <div className="mw-admin-filters-bar__row">{children}</div>
    </div>
  );
}

export function AdminFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mw-admin-filters-bar__field">
      <label>{label}</label>
      {children}
    </div>
  );
}
