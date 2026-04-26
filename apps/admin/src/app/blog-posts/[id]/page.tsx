"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminJson, getAdminToken } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";

type BlogPost = {
  id: string;
  contentItemId: string;
  contentDraftId: string;
  placement: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  sourceUrl: string | null;
  status: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  tags: string[];
  discipline: string | null;
  region: string | null;
  country: string | null;
  relatedProgramIds: string[];
  relatedOrganizerIds: string[];
  publishedAt: string;
  updatedAt: string;
};

export default function BlogPostEditPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [row, setRow] = useState<BlogPost | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<BlogPost>>({});

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
        const data = await adminJson<BlogPost>(`/api/content-pipeline/blog-posts/${id}`);
        setRow(data);
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
      const payload = {
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        body: form.body,
        sourceUrl: form.sourceUrl,
        status: form.status,
        seoTitle: form.seoTitle,
        seoDescription: form.seoDescription,
        canonicalUrl: form.canonicalUrl,
        ogImage: form.ogImage,
        tags: form.tags,
        discipline: form.discipline,
        region: form.region,
        country: form.country,
        relatedProgramIds: form.relatedProgramIds,
        relatedOrganizerIds: form.relatedOrganizerIds,
      };
      const out = await adminJson<BlogPost>(`/api/content-pipeline/blog-posts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setRow(out);
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
        <AdminPageHeader title="Редактор статьи" description="Не указан id в URL." />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mw-admin-page mw-admin-page--narrow">
        <AdminPageHeader title="Редактор статьи" description="Загрузка…" />
        <AdminLoadingState />
      </main>
    );
  }

  return (
    <main className="mw-admin-page mw-admin-page--narrow">
      <AdminPageHeader
        title="Редактор blog post"
        description={
          row ? (
            <>
              contentItem <code className="mw-admin-code">{row.contentItemId}</code> · draft{" "}
              <code className="mw-admin-code">{row.contentDraftId}</code>
            </>
          ) : (
            "Карточка не загружена"
          )
        }
        actions={
          <Link className="mw-admin-btn mw-admin-btn--ghost" href="/blog-posts">
            ← К списку
          </Link>
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
              <input
                className="mw-admin-input"
                value={form.slug ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Title (H1)</span>
              <input
                className="mw-admin-input"
                value={form.title ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Статус</span>
              <select value={form.status ?? "published"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="published">published</option>
                <option value="draft">draft</option>
                <option value="archived">archived</option>
              </select>
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Source URL</span>
              <input
                className="mw-admin-input"
                value={form.sourceUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value || null }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="SEO и ссылки">
            <div className="mw-admin-field">
              <span className="mw-admin-label">SEO title</span>
              <input
                className="mw-admin-input"
                value={form.seoTitle ?? ""}
                placeholder="Пусто = как title"
                onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value || null }))}
              />
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
              <input
                className="mw-admin-input"
                value={form.canonicalUrl ?? ""}
                placeholder="https://… или пусто = site + /blog/slug"
                onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value || null }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">OG image URL</span>
              <input
                className="mw-admin-input"
                value={form.ogImage ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ogImage: e.target.value || null }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Теги и география">
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
            <div className="mw-admin-form-grid-2" style={{ marginTop: 4 }}>
              <div className="mw-admin-field" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Discipline</span>
                <input
                  className="mw-admin-input"
                  value={form.discipline ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value || null }))}
                />
              </div>
              <div className="mw-admin-field" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Region</span>
                <input
                  className="mw-admin-input"
                  value={form.region ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value || null }))}
                />
              </div>
              <div className="mw-admin-field mw-admin-form-span-2" style={{ marginBottom: 0 }}>
                <span className="mw-admin-label">Country</span>
                <input
                  className="mw-admin-input"
                  value={form.country ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value || null }))}
                />
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Связанные сущности (cuid через запятую)">
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

          <AdminSectionCard title="Контент">
            <div className="mw-admin-field">
              <span className="mw-admin-label">Excerpt</span>
              <textarea
                className="mw-admin-textarea"
                rows={3}
                value={form.excerpt ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value || null }))}
              />
            </div>
            <div className="mw-admin-field">
              <span className="mw-admin-label">Body</span>
              <textarea
                className="mw-admin-textarea"
                rows={8}
                value={form.body ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value || null }))}
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
