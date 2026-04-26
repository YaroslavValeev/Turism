"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminJson, getAdminToken } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";

type Col = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: string | null;
  status: string;
  collectionType: string;
  discipline: string | null;
  region: string | null;
  country: string | null;
  season: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  tags: string[];
  relatedBlogPostIds: string[];
  relatedProgramIds: string[];
  relatedOrganizerIds: string[];
  publishedAt: string | null;
  updatedAt: string;
};

export default function CollectionEditPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [form, setForm] = useState<Partial<Col>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);

  const previewBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const data = await adminJson<Col>(`/api/content-pipeline/content-collections/${id}`);
        setForm(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function save() {
    if (!id) return;
    setSaving(true);
    setOk("");
    setError("");
    try {
      const out = await adminJson<Col>(`/api/content-pipeline/content-collections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          slug: form.slug,
          title: form.title,
          description: form.description,
          body: form.body,
          status: form.status,
          collectionType: form.collectionType,
          discipline: form.discipline,
          region: form.region,
          country: form.country,
          season: form.season,
          seoTitle: form.seoTitle,
          seoDescription: form.seoDescription,
          canonicalUrl: form.canonicalUrl,
          ogImage: form.ogImage,
          tags: form.tags,
          relatedBlogPostIds: form.relatedBlogPostIds,
          relatedProgramIds: form.relatedProgramIds,
          relatedOrganizerIds: form.relatedOrganizerIds,
        }),
      });
      setForm(out);
      setOk("Сохранено");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <main className="mw-admin-page mw-admin-page--narrow">
        <AdminPageHeader title="Редактор подборки" description="Не указан id в URL." />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mw-admin-page mw-admin-page--narrow">
        <AdminPageHeader title="Редактор подборки" description="Загрузка…" />
        <AdminLoadingState />
      </main>
    );
  }

  return (
    <main className="mw-admin-page mw-admin-page--narrow">
      <AdminPageHeader
        title="Редактор подборки"
        description={form.slug ? `Slug: ${form.slug}` : "Новая или неполная карточка"}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Link className="mw-admin-btn mw-admin-btn--ghost" href="/collections">
              ← К списку
            </Link>
            {form.slug && previewBase && form.status === "published" ? (
              <a
                className="mw-admin-btn mw-admin-btn--ghost"
                href={`${previewBase}/collections/${encodeURIComponent(String(form.slug))}`}
                target="_blank"
                rel="noreferrer"
              >
                Preview
              </a>
            ) : null}
          </div>
        }
      />

      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {ok && <div className="mw-admin-alert mw-admin-alert--success">{ok}</div>}

      {form.title !== undefined && (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AdminSectionCard title="Основное" style={{ marginBottom: 0 }}>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Slug</span>
              <input className="mw-admin-input" value={form.slug ?? ""} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Title</span>
              <input className="mw-admin-input" value={form.title ?? ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Status</span>
              <select value={form.status ?? "draft"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="draft">draft</option>
                <option value="published">published</option>
              </select>
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Collection type</span>
              <input
                className="mw-admin-input"
                value={form.collectionType ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, collectionType: e.target.value }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Description</span>
              <textarea
                className="mw-admin-textarea"
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Body</span>
              <textarea
                className="mw-admin-textarea"
                rows={6}
                value={form.body ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value || null }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="География и сезон">
            <div className="mw-admin-form-grid-2">
              <div className="mw-admin-field" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Discipline</span>
                <input className="mw-admin-input" value={form.discipline ?? ""} onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value || null }))} />
              </div>
              <div className="mw-admin-field" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Region</span>
                <input className="mw-admin-input" value={form.region ?? ""} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value || null }))} />
              </div>
              <div className="mw-admin-field" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Country</span>
                <input className="mw-admin-input" value={form.country ?? ""} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value || null }))} />
              </div>
              <div className="mw-admin-field" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Season</span>
                <input className="mw-admin-input" value={form.season ?? ""} onChange={(e) => setForm((f) => ({ ...f, season: e.target.value || null }))} />
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="SEO">
            <div className="mw-admin-field">
              <span className="mw-admin-label">SEO title</span>
              <input className="mw-admin-input" value={form.seoTitle ?? ""} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value || null }))} />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">SEO description</span>
              <textarea
                className="mw-admin-textarea"
                rows={3}
                value={form.seoDescription ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value || null }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Canonical URL</span>
              <input className="mw-admin-input" value={form.canonicalUrl ?? ""} onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value || null }))} />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">OG image URL</span>
              <input className="mw-admin-input" value={form.ogImage ?? ""} onChange={(e) => setForm((f) => ({ ...f, ogImage: e.target.value || null }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Теги и связи">
            <div className="mw-admin-field">
              <span className="mw-admin-label">Теги (через запятую)</span>
              <input
                className="mw-admin-input"
                value={(form.tags ?? []).join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    tags: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Related blog post ids</span>
              <input
                className="mw-admin-input mw-admin-td-mono"
                style={{ fontSize: "0.88rem" }}
                value={(form.relatedBlogPostIds ?? []).join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    relatedBlogPostIds: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Related program ids</span>
              <input
                className="mw-admin-input mw-admin-td-mono"
                style={{ fontSize: "0.88rem" }}
                value={(form.relatedProgramIds ?? []).join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    relatedProgramIds: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Related organizer ids</span>
              <input
                className="mw-admin-input mw-admin-td-mono"
                style={{ fontSize: "0.88rem" }}
                value={(form.relatedOrganizerIds ?? []).join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    relatedOrganizerIds: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
          </AdminSectionCard>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button type="submit" className="mw-admin-btn" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
