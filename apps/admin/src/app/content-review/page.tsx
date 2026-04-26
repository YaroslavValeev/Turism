"use client";

import { useEffect, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";

type Item = {
  id: string;
  workflowStatus: string;
  updatedAt: string;
  rawItem: { sourceUrl: string | null; rawTitle: string | null; sourceType: string };
  drafts: Array<{ id: string; version: number; draftType: string; generatedHeadline: string | null; status: string }>;
};

type Approval = {
  id: string;
  decision: string;
  comment: string | null;
  source: string | null;
  decidedBy: string | null;
  createdAt: string;
  contentItem: { id: string; workflowStatus: string };
  contentDraft: { id: string; draftType: string; version: number; generatedHeadline: string | null } | null;
};

export default function ContentReviewPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");

  async function load() {
    try {
      const [pending, history] = await Promise.all([
        adminJson<Item[]>("/api/content-pipeline/items?status=pending_owner_review"),
        adminJson<Approval[]>("/api/content-pipeline/approvals"),
      ]);
      setItems(pending);
      setApprovals(history);
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

  async function resend(draftId: string) {
    setBusy(draftId);
    try {
      await adminJson(`/api/content-pipeline/drafts/${draftId}/send-owner`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mw-admin-page">
      <h1>Owner Review</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <h2>Pending Owner Review</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr>
            <th align="left">Content Item</th>
            <th align="left">Draft</th>
            <th align="left">Источник</th>
            <th align="left">Действие</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const draft = item.drafts[0];
            return (
              <tr key={item.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{item.id.slice(0, 10)}…</td>
                <td>
                  {draft?.generatedHeadline || "—"}
                  <br />
                  <small>{draft?.draftType} v{draft?.version}</small>
                </td>
                <td>{item.rawItem.sourceUrl || item.rawItem.rawTitle || "—"}</td>
                <td>
                  {draft ? (
                    <button type="button" onClick={() => void resend(draft.id)} disabled={busy === draft.id}>
                      {busy === draft.id ? "Отправка..." : "Resend"}
                    </button>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>История решений</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Когда</th>
            <th align="left">Decision</th>
            <th align="left">Item</th>
            <th align="left">Draft</th>
            <th align="left">Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {approvals.slice(0, 120).map((a) => (
            <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{new Date(a.createdAt).toLocaleString("ru-RU")}</td>
              <td>{a.decision}</td>
              <td>{a.contentItem.id.slice(0, 10)}…</td>
              <td>{a.contentDraft ? `${a.contentDraft.draftType} v${a.contentDraft.version}` : "—"}</td>
              <td>{a.comment || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

