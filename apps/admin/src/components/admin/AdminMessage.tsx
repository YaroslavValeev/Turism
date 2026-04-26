export function AdminMessage({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  if (!children) return null;
  return <div className={type === "error" ? "mw-admin-alert mw-admin-alert--error" : "mw-admin-alert mw-admin-alert--success"}>{children}</div>;
}
