"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_NAV_GROUPS } from "./adminNavConfig";
import { AdminIcon } from "./AdminIcon";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(href + "/")) return true;
  return false;
}

const STORAGE_KEY = "mw_admin_nav_collapsed";

type Props = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function AdminSidebar({ mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") setCollapsed(parsed);
        return;
      }
    } catch {
      /* ignore */
    }
    /* Первый визит: свернуть самые длинные группы; «Операционка» и «Аналитика» остаются раскрыты. */
    setCollapsed({ content: true, finance: true });
  }, []);

  useEffect(() => {
    if (!pathname) return;
    setCollapsed((c) => {
      const next = { ...c };
      let changed = false;
      for (const g of ADMIN_NAV_GROUPS) {
        if (g.items.some((i) => isActive(pathname, i.href)) && c[g.id] === true) {
          next[g.id] = false;
          changed = true;
        }
      }
      if (!changed) return c;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const set = () => setIsNarrow(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  const sidebarClass =
    "mw-admin-sidebar" + (isNarrow && !mobileOpen ? " mw-admin-sidebar--hidden" : "");

  return (
    <>
      <div
        className={"mw-admin-sidebar-overlay" + (isNarrow && mobileOpen ? " mw-admin-sidebar-overlay--on" : "")}
        onClick={onCloseMobile}
        onKeyDown={(e) => e.key === "Escape" && onCloseMobile()}
        role="presentation"
        aria-hidden
      />
      <aside className={sidebarClass} style={{ zIndex: 50 }}>
        <div className="mw-admin-sidebar__brand">
          <div className="mw-admin-sidebar__logo" aria-hidden />
          <Link
            href="/"
            onClick={() => isNarrow && onCloseMobile()}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            <span>MyWave Tour</span>{" "}
            <span style={{ fontWeight: 600, opacity: 0.85 }}>Admin</span>
          </Link>
        </div>
        <nav className="mw-admin-sidebar__scroll" aria-label="Разделы админки">
          {ADMIN_NAV_GROUPS.map((group) => {
            const isOpen = collapsed[group.id] !== true;
            return (
              <div
                key={group.id}
                className={"mw-admin-nav-group" + (isOpen ? " mw-admin-nav-group--open" : " mw-admin-nav-group--closed")}
              >
                <button
                  type="button"
                  className="mw-admin-nav-group__title"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>
                  <span className="mw-admin-nav-group__chev" aria-hidden>
                    ▼
                  </span>
                </button>
                {isOpen && (
                  <div>
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => isNarrow && onCloseMobile()}
                          className={"mw-admin-nav-link" + (active ? " mw-admin-nav-link--active" : "")}
                        >
                          <AdminIcon name={item.icon} />
                          <span style={{ minWidth: 0 }}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
