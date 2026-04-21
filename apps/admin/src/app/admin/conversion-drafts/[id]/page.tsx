"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminNav } from "../../../../components/AdminNav";
import { adminJson, getAdminToken } from "../../../../lib/admin";

type AuditRow = {
  id: string;
  changedField: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
};

type DeliveryRow = {
  id: string;
  channel: string;
  outcome: string;
  sentAt: string;
  dedupeKey: string;
} | null;

type DraftDetail = {
  id: string;
  programId: string;
  organizerId: string;
  stage: number;
  channel: string;
  status: string;
  messageText: string;
  dedupeKey: string;
  metricsSnapshotJson: Record<string, unknown>;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  deferredUntil: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  ownerNotifiedAt: string | null;
  ownerNotifyLastAttemptAt: string | null;
  ownerNotifyLastError: string | null;
  ownerNotifyStatus: "sent" | "pending" | "failed";
  ownerNotifyErrorSnippet: string | null;
  organizer: {
    id: string;
    displayName: string | null;
    contactEmail: string;
    telegramChatId: string | null;
  };
  program: { id: string; title: string; publishStatus: string };
  delivery: DeliveryRow;
  auditHistory: AuditRow[];
};

const DEFER_PRESETS = [6, 12, 24, 48, 72, 168] as const;

export default function ConversionDraftDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [data, setData] = useState<DraftDetail | null>(null);
  const [messageText, setMessageText] = useState("");
  const [deferHours, setDeferHours] = useState(24);
  const [deferCustom, setDeferCustom] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveOk, setSaveOk] = useState("");

  const load = useCallback(async () => {
    setError("");
    setSaveOk("");
    const d = await adminJson<DraftDetail>(`/admin/conversion-drafts/${encodeURIComponent(id)}`);
    setData(d);
    setMessageText(d.messageText);
  }, [id]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    if (!id) return;
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id, load]);

  const canEdit = data && (data.status === "awaiting_owner" || data.status === "edited");
  const canAct = canEdit;
  const canReopen = data && (data.status === "rejected" || data.status === "deferred");

  async function saveText() {
    if (!data) return;
    setBusy(true);
    setError("");
    setSaveOk("");
    try {
      await adminJson(`/admin/conversion-drafts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ messageText }),
      });
      setSaveOk("Сохранено");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function postAction(path: string, body?: object) {
    setBusy(true);
    setError("");
    setSaveOk("");
    try {
      await adminJson(`/admin/conversion-drafts/${encodeURIComponent(id)}${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Загрузка…</p>;
  if (!data) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "crimson" }}>{error || "Нет данных"}</p>
        <Link href="/admin/conversion-drafts">← К списку</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 960 }}>
      <AdminNav current="/admin/conversion-drafts" />
      <p>
        <Link href="/admin/conversion-drafts">← Conversion drafts</Link>
        {" · "}
        <Link href={`/admin/conversion-drafts?programId=${encodeURIComponent(data.programId)}`}>Фильтр по программе</Link>
        {" · "}
        <Link href={`/programs#admin-program-${data.programId}`}>Программа в списке</Link>
      </p>

      <h1 style={{ marginTop: 8 }}>Черновик · этап {data.stage}</h1>
      <p style={{ color: "#555" }}>
        <strong>{data.program.title}</strong> · организатор: {data.organizer.displayName || data.organizer.contactEmail}
      </p>
      <p style={{ fontSize: 14 }} data-testid="conversion-draft-status-line">
        Статус: <strong data-testid="conversion-draft-status">{data.status}</strong> · планируемый канал: {data.channel} · dedupeKey:{" "}
        <code style={{ fontSize: 12 }}>{data.dedupeKey}</code>
      </p>

      <section
        style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(0,0,0,0.04)", fontSize: 14 }}
        data-testid="conversion-draft-owner-notify"
      >
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Уведомление owner (Telegram)</h2>
        <p style={{ margin: "0 0 6px" }}>
          Статус доставки: <strong data-testid="conversion-draft-owner-notify-status">{data.ownerNotifyStatus}</strong>
          {data.ownerNotifiedAt && (
            <span style={{ marginLeft: 8, color: "#555", fontSize: 13 }}>
              ownerNotifiedAt: {new Date(data.ownerNotifiedAt).toLocaleString("ru-RU")}
            </span>
          )}
        </p>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: "#555" }}>
          Последняя попытка:{" "}
          {data.ownerNotifyLastAttemptAt
            ? new Date(data.ownerNotifyLastAttemptAt).toLocaleString("ru-RU")
            : "—"}
        </p>
        {data.ownerNotifyErrorSnippet && (
          <p style={{ margin: 0, fontSize: 13, color: "#b42318" }} data-testid="conversion-draft-owner-notify-error">
            Ошибка: {data.ownerNotifyErrorSnippet}
          </p>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 18 }}>Метрики (снимок)</h2>
        <pre
          style={{
            background: "#f6f6f6",
            padding: 12,
            borderRadius: 6,
            overflow: "auto",
            fontSize: 13,
          }}
        >
          {JSON.stringify(data.metricsSnapshotJson, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 18 }}>Текст сообщения</h2>
        <textarea
          data-testid="conversion-draft-message-text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          disabled={!canEdit || busy}
          rows={14}
          style={{ width: "100%", padding: 10, fontFamily: "inherit", fontSize: 14 }}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => saveText()} disabled={!canEdit || busy} style={{ padding: "8px 16px" }}>
            Сохранить текст
          </button>
          {saveOk && <span style={{ color: "green" }}>{saveOk}</span>}
        </div>
        {!canEdit && <p style={{ fontSize: 13, color: "#666" }}>Редактирование только для статусов awaiting_owner / edited.</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Действия</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" disabled={!canAct || busy} onClick={() => postAction("/send")} style={{ padding: "8px 16px" }}>
            Send организатору
          </button>
          <button
            type="button"
            data-testid="conversion-draft-reject"
            disabled={!canAct || busy}
            onClick={() => postAction("/reject")}
            style={{ padding: "8px 16px" }}
          >
            Reject
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Defer (ч)</span>
            <select
              value={deferHours}
              onChange={(e) => setDeferHours(Number(e.target.value))}
              disabled={!canAct || busy}
            >
              {DEFER_PRESETS.map((h) => (
                <option key={h} value={h}>
                  {h} ч
                </option>
              ))}
            </select>
            <span>или</span>
            <input
              type="number"
              min={1}
              max={168}
              placeholder="часы"
              value={deferCustom}
              onChange={(e) => setDeferCustom(e.target.value)}
              disabled={!canAct || busy}
              style={{ width: 72, padding: 4 }}
            />
            <button
              type="button"
              data-testid="conversion-draft-defer"
              disabled={!canAct || busy}
              onClick={() => {
                const raw = deferCustom.trim();
                const h = raw ? Math.min(168, Math.max(1, Number(raw))) : deferHours;
                void postAction("/defer", { deferHours: h });
              }}
              style={{ padding: "8px 16px" }}
            >
              Defer
            </button>
          </label>
          <button
            type="button"
            data-testid="conversion-draft-reopen"
            disabled={!canReopen || busy}
            onClick={() => postAction("/reopen")}
            style={{ padding: "8px 16px" }}
          >
            Reopen
          </button>
          <button type="button" disabled={busy} onClick={() => load().catch(() => {})} style={{ padding: "8px 16px" }}>
            Обновить состояние
          </button>
        </div>
        {data.deferredUntil && (
          <p style={{ marginTop: 8, fontSize: 14 }}>
            deferredUntil: <strong>{new Date(data.deferredUntil).toLocaleString("ru-RU")}</strong>
          </p>
        )}
      </section>

      {data.delivery && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18 }}>Доставка организатору</h2>
          <p style={{ fontSize: 14 }}>
            Канал: {data.delivery.channel} · outcome: {data.delivery.outcome} ·{" "}
            {new Date(data.delivery.sentAt).toLocaleString("ru-RU")}
          </p>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>История (audit)</h2>
        {data.auditHistory.length === 0 ? (
          <p style={{ fontSize: 14 }}>Записей нет.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 6 }}>время</th>
                <th style={{ padding: 6 }}>действие</th>
                <th style={{ padding: 6 }}>было</th>
                <th style={{ padding: 6 }}>стало</th>
                <th style={{ padding: 6 }}>кто</th>
              </tr>
            </thead>
            <tbody>
              {data.auditHistory.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{new Date(a.createdAt).toLocaleString("ru-RU")}</td>
                  <td style={{ padding: 6 }}>{a.changedField}</td>
                  <td style={{ padding: 6, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{a.oldValue ?? "—"}</td>
                  <td style={{ padding: 6, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{a.newValue ?? "—"}</td>
                  <td style={{ padding: 6 }}>{a.changedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {error && <p style={{ color: "crimson", marginTop: 16 }}>{error}</p>}
    </main>
  );
}
