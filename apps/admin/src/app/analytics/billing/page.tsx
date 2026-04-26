"use client";

import { useEffect, useMemo, useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminEmptyState } from "../../../components/admin/AdminEmptyState";

type BillingRow = Record<string, unknown>;

const COLUMNS: string[] = [
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
];

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
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Биллинг: дневной срез × организатор"
        description={
          <>
            Источник mart: <code className="mw-admin-code">mv_billing_daily</code>
            {". "}
            Период: <strong>{from}</strong> — <strong>{to}</strong> (UTC, календарные даты).
          </>
        }
      />
      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {loading && <AdminLoadingState label="Загружаем данные…" />}

      {!loading && !error && rows.length === 0 && (
        <AdminEmptyState
          title="Нет строк в mart"
          description="mv_billing_daily пустой или нет движения по платежам и комиссиям за период. На dev это нормально."
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <AdminSectionCard title="Таблица" style={{ marginBottom: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="mw-admin-table" style={{ minWidth: 1200, margin: 0 }}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c} style={{ whiteSpace: "nowrap" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ whiteSpace: "nowrap" }}>{String(r.day ?? "")}</td>
                      <td
                        className="mw-admin-code"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {String(r.organizerId ?? "")}
                      </td>
                      <td>{String(r.payments_amount_rub ?? "")}</td>
                      <td>{String(r.payments_count ?? "")}</td>
                      <td>{String(r.refunds_amount_rub ?? "")}</td>
                      <td>{String(r.refunds_count ?? "")}</td>
                      <td>{String(r.commissions_accrued_rub ?? "")}</td>
                      <td>{String(r.commissions_approved_rub ?? "")}</td>
                      <td>{String(r.commissions_invoiced_rub ?? "")}</td>
                      <td>{String(r.commissions_paid_rub ?? "")}</td>
                      <td>{String(r.commissions_reversed_rub ?? "")}</td>
                      <td>{String(r.commissions_disputed_rub ?? "")}</td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSectionCard>
      )}
    </main>
  );
}
