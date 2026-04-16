"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminNav } from "../../../components/AdminNav";
import { adminJson } from "../../../lib/admin";

type BillingRow = Record<string, unknown>;

export default function BillingAnalyticsPage() {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const from = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  }, []);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    adminJson<{ rows: BillingRow[] }>(`/metrics/billing/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((data) => setRows(Array.isArray(data.rows) ? data.rows : []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [from, to]);

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/analytics/billing" />
      <h1>Analytics — Billing (daily × organizer)</h1>
      <p style={{ color: "#555", maxWidth: 980 }}>
        Источник: <code>mv_billing_daily</code>. Период: <strong>{from}</strong>…<strong>{to}</strong> (UTC даты).
      </p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1200 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
                {[
                  "day",
                  "organizerId",
                  "payments_amount_rub",
                  "payments_count",
                  "refunds_amount_rub",
                  "refunds_count",
                  "commissions_accrued_rub",
                  "commissions_approved_rub",
                  "commissions_invoiced_rub",
                  "commissions_paid_rub",
                  "commissions_reversed_rub",
                  "commissions_disputed_rub",
                ].map((c) => (
                  <th key={c} style={{ textAlign: "left", padding: 8, whiteSpace: "nowrap" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 12, color: "#666" }}>
                    Пока нет строк (mart пустой или нет движения по платежам/комиссиям).
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, whiteSpace: "nowrap" }}>{String(r.day ?? "")}</td>
                    <td style={{ padding: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {String(r.organizerId ?? "")}
                    </td>
                    <td style={{ padding: 8 }}>{String(r.payments_amount_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.payments_count ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.refunds_amount_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.refunds_count ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commissions_accrued_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commissions_approved_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commissions_invoiced_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commissions_paid_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commissions_reversed_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commissions_disputed_rub ?? "")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
