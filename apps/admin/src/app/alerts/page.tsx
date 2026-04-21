"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import { adminJson, getAdminToken } from "../../lib/admin";

type AlertRow = {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  detail: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSentAt: string | null;
};

type AlertsResponse = {
  active_alerts: AlertRow[];
  critical_open_count: number;
  last_digest_sent_at: string | null;
};

export default function AdminAlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    adminJson<AlertsResponse>("/admin/alerts")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (typeof window !== "undefined" && !getAdminToken()) {
    return <p>Перенаправляем…</p>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <AdminNav current="/alerts" />
      <h1 style={{ marginTop: 0 }}>Governance alerts</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Read-only снимок открытых алертов (economics + ingestion + conversion). Источник:{" "}
        <code>GET /admin/alerts</code> — тот же контур, что economics. Документация:{" "}
        <code>docs/operations/ALERT_CATALOG.md</code>
      </p>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      {data ? (
        <>
          <p>
            <strong>Critical (open):</strong> {data.critical_open_count} ·{" "}
            <strong>Last digest:</strong> {data.last_digest_sent_at ?? "—"}
          </p>
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th>Severity</th>
                <th>Type</th>
                <th>Title</th>
                <th>Detail</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.active_alerts.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td>{a.severity}</td>
                  <td>
                    <code>{a.alertType}</code>
                  </td>
                  <td>{a.title}</td>
                  <td style={{ maxWidth: 420 }}>{a.detail}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(a.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.active_alerts.length === 0 ? <p>Нет открытых алертов.</p> : null}
        </>
      ) : (
        !error && <p>Загрузка…</p>
      )}
    </main>
  );
}
