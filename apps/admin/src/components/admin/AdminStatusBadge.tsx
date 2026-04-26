export type AdminStatusBadgeTone = "muted" | "ok" | "warn" | "danger";

const toneClass: Record<AdminStatusBadgeTone, string> = {
  muted: "mw-admin-badge mw-admin-badge--muted",
  ok: "mw-admin-badge mw-admin-badge--ok",
  warn: "mw-admin-badge mw-admin-badge--warn",
  danger: "mw-admin-badge",
};

export function AdminStatusBadge({
  children,
  tone = "muted",
  style,
}: {
  children: React.ReactNode;
  tone?: AdminStatusBadgeTone;
  style?: React.CSSProperties;
}) {
  const base = toneClass[tone];
  const extra = tone === "danger" ? { background: "#fff0f0", borderColor: "#f0c0c0", color: "#7f1d1d" } : {};
  return (
    <span className={base} style={{ ...extra, ...style }}>
      {children}
    </span>
  );
}
