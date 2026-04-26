"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminJson, getAdminToken } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";

export default function NewCollectionPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (typeof window !== "undefined" && !getAdminToken()) {
    window.location.href = "/login";
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const row = await adminJson<{ id: string }>("/api/content-pipeline/content-collections", {
        method: "POST",
        body: JSON.stringify({ slug: slug.trim(), title: title.trim(), status: "draft" }),
      });
      router.replace(`/collections/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mw-admin-page mw-admin-page--form">
      <AdminPageHeader
        title="Новая подборка"
        description="Черновик с уникальным slug; после создания откроется полный редактор."
        actions={
          <Link className="mw-admin-btn mw-admin-btn--ghost" href="/collections">
            ← К списку
          </Link>
        }
      />

      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}

      <AdminSectionCard title="Параметры" style={{ marginBottom: 0 }}>
        <div className="mw-admin-field">
          <span className="mw-admin-label">Slug (латиница, уникальный)</span>
          <input
            className="mw-admin-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="mw-admin-field" style={{ marginBottom: 0 }}>
          <span className="mw-admin-label">Заголовок</span>
          <input className="mw-admin-input" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="mw-admin-btn"
            disabled={busy || !slug.trim() || !title.trim()}
            onClick={() => void create()}
          >
            {busy ? "Создание…" : "Создать"}
          </button>
        </div>
      </AdminSectionCard>
    </main>
  );
}
