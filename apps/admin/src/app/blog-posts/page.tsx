"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminJson, getAdminToken } from "../../lib/admin";

type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  placement: string;
  status: string;
  publishedAt: string;
  discipline: string | null;
  region: string | null;
};

export default function BlogPostsListPage() {
  const [rows, setRows] = useState<BlogPostRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void (async () => {
      try {
        const data = await adminJson<BlogPostRow[]>("/api/content-pipeline/blog-posts");
        setRows(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main className="mw-admin-page">
      <h1>Blog posts</h1>
      <p style={{ color: "#555", maxWidth: 640 }}>
        Редактирование SEO, тегов и связей с программами/организаторами. Публичные URL:{" "}
        <code>/blog/…</code> на сайте.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            <th align="left">Заголовок</th>
            <th align="left">Slug</th>
            <th align="left">Статус</th>
            <th align="left">Публикация</th>
            <th align="left" />
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((r) => r.placement === "blog")
            .map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{r.title}</td>
                <td>
                  <code>{r.slug}</code>
                </td>
                <td>{r.status}</td>
                <td>{new Date(r.publishedAt).toLocaleString("ru-RU")}</td>
                <td>
                  <Link href={`/blog-posts/${r.id}`}>Редактировать</Link>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </main>
  );
}
