"use client";

type Props = {
  onOpenSidebar: () => void;
  searchDisabled?: boolean;
};

export function AdminTopbar({ onOpenSidebar, searchDisabled = true }: Props) {
  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("admin_token");
      window.location.href = "/login";
    }
  }

  return (
    <header className="mw-admin-topbar">
      <button
        type="button"
        className="mw-admin-topbar__toggle mw-admin-btn mw-admin-btn--ghost"
        style={{ display: "none", padding: "8px 12px", fontSize: "0.85rem" }}
        onClick={onOpenSidebar}
        aria-label="Открыть меню"
      >
        Меню
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span className="mw-admin-topbar__mobile-brand" style={{ display: "none" }}>
          <span style={{ fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.03em" }}>MyWave</span>
          <span style={{ color: "var(--mw-muted2)", fontWeight: 600, fontSize: "0.85rem" }}>Admin</span>
        </span>
        <span className="mw-admin-topbar__desktop-hint" style={{ color: "var(--mw-muted2)", fontSize: "0.86rem" }}>
          Операционная панель
        </span>
      </div>
      <div className="mw-admin-topbar__search" title="Глобальный поиск — в разработке">
        <input
          type="search"
          placeholder="Поиск по разделам (скоро)…"
          disabled={searchDisabled}
          readOnly
          onChange={() => {}}
          onKeyDown={(e) => e.preventDefault()}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
        <a
          href={process.env.NEXT_PUBLIC_WEB_URL || "/"}
          className="mw-admin-btn mw-admin-btn--ghost"
          style={{ fontSize: "0.86rem", padding: "8px 14px" }}
          target="_blank"
          rel="noreferrer"
        >
          Сайт
        </a>
        <button
          type="button"
          className="mw-admin-btn mw-admin-btn--ghost"
          onClick={handleLogout}
          style={{ fontSize: "0.86rem", padding: "8px 14px" }}
        >
          Выйти
        </button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 899px) {
          .mw-admin-topbar__mobile-brand { display: inline-flex !important; align-items: baseline; gap: 6px; }
          .mw-admin-topbar__desktop-hint { display: none !important; }
        }
      `}} />
    </header>
  );
}
