"use client";

import { useEffect, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";

type Publication = {
  id: string;
  channel: string;
  state: string;
  externalUrl: string | null;
  externalPostId: string | null;
  retryCount: number;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  publishedAt: string | null;
  contentDraft: { id: string; draftType: string; version: number; generatedHeadline: string | null };
};

export default function PublicationsPage() {
  const [rows, setRows] = useState<Publication[]>([]);
  const [state, setState] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const qs = new URLSearchParams();
    if (state) qs.set("state", state);
    if (channel) qs.set("channel", channel);
    try {
      const data = await adminJson<Publication[]>(`/api/content-pipeline/publications?${qs.toString()}`);
      setRows(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, []);

  async function retry(id: string) {
    setBusy(id);
    try {
      await adminJson(`/api/content-pipeline/publications/${id}/retry`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mw-admin-page">
      <h1>Publications</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">all channels</option>
          <option value="telegram_channel">telegram_channel</option>
          <option value="site_blog">site_blog</option>
          <option value="site_landing">site_landing</option>
          <option value="vk">vk</option>
          <option value="facebook">facebook</option>
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">all states</option>
          <option value="pending">pending</option>
          <option value="publishing">publishing</option>
          <option value="published">published</option>
          <option value="failed">failed</option>
        </select>
        <button type="button" onClick={() => void load()}>Применить</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Канал</th>
            <th align="left">Статус</th>
            <th align="left">Draft</th>
            <th align="left">External</th>
            <th align="left">Ошибки</th>
            <th align="left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{r.channel}</td>
              <td>{r.state}</td>
              <td>{r.contentDraft.draftType} v{r.contentDraft.version}</td>
              <td>{r.externalUrl ? <a href={r.externalUrl} target="_blank" rel="noreferrer">open</a> : r.externalPostId || "—"}</td>
              <td>{r.errorCode ? `${r.errorCode}: ${r.errorDetail || ""}` : "—"}</td>
              <td>
                <button type="button" disabled={r.state !== "failed" || busy === r.id} onClick={() => void retry(r.id)}>
                  {busy === r.id ? "Retry..." : "Retry"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

