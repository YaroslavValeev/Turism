"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ADMIN_NAV_GROUPS } from "./adminNavConfig";

type Props = {
  onOpenSidebar: () => void;
};

type SearchHit = { href: string; label: string; group: string };

const ALL_SECTIONS: SearchHit[] = ADMIN_NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ href: item.href, label: item.label, group: g.label })),
);

export function findAdminSections(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_SECTIONS.filter(
    (s) => s.label.toLowerCase().includes(q) || s.group.toLowerCase().includes(q) || s.href.includes(q),
  ).slice(0, 8);
}

export function AdminTopbar({ onOpenSidebar }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => findAdminSections(query), [query]);

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("admin_token");
      window.location.href = "/login";
    }
  }

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    setQuery("");
    setOpen(false);
    router.push(hit.href);
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
        <Link
          href="/"
          className="mw-admin-topbar__desktop-hint"
          style={{ color: "var(--mw-muted2)", fontSize: "0.86rem", textDecoration: "none" }}
        >
          Операционная панель
        </Link>
      </div>
      <div className="mw-admin-topbar__search">
        <input
          type="search"
          placeholder="Поиск по разделам…"
          value={query}
          aria-label="Поиск по разделам админки"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && query.trim() ? (
          <ul className="mw-admin-topbar__results" role="listbox">
            {hits.length === 0 ? (
              <li className="mw-admin-topbar__empty">Раздел не найден</li>
            ) : (
              hits.map((hit, i) => (
                <li key={hit.href} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={i === active ? "is-active" : undefined}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(hit);
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span>{hit.label}</span>
                    <small>{hit.group}</small>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
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
