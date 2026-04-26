export function AdminLoadingState({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="mw-admin-loading" role="status" aria-live="polite">
      <div className="mw-admin-loading__pulse" aria-hidden />
      <p style={{ margin: 0, fontSize: "0.95rem" }}>{label}</p>
    </div>
  );
}
