export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header
      className="mw-admin-page-header"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px 24px",
        marginBottom: 24,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ marginBottom: description ? 6 : 0 }}>{title}</h1>
        {description && (
          <p className="mw-admin-prose" style={{ maxWidth: 52 * 16 }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div
          className="mw-admin-page-header__actions"
          style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
