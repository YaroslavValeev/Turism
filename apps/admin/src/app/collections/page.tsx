"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminJson, getAdminToken } from "../../lib/admin";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
};

export default function CollectionsListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void (async () => {
      try {
        const data = await adminJson<Row[]>("/api/content-pipeline/content-collections");
        setRows(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const previewBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

  return (
    <main className="mw-admin-page">
      <h1>Подборки (content collections)</h1>
      <p>
        <Link href="/collections/new">+ Создать подборку</Link>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            <th align="left">Title</th>
            <th align="left">Slug</th>
            <th align="left">Status</th>
            <th align="left">Published</th>
            <th align="left" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{r.title}</td>
              <td>
                <code>{r.slug}</code>
              </td>
              <td>{r.status}</td>
              <td>{r.publishedAt ? new Date(r.publishedAt).toLocaleString("ru-RU") : "—"}</td>
              <td>
                <Link href={`/collections/${r.id}`}>Редактировать</Link>
                {r.status === "published" && previewBase ? (
                  <>
                    {" · "}
                    <a href={`${previewBase}/collections/${encodeURIComponent(r.slug)}`} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
