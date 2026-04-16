"use client";

import { useEffect, useState } from "react";
import { getBillingStatementStatusLabel } from "@mywave/shared-types";
import { AdminNav } from "../../components/AdminNav";
import { adminJson } from "../../lib/admin";

type Statement = {
  id: string;
  organizerId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossPaidRub: number;
  refundedRub: number;
  netSalesRub: number;
  commissionTotalRub: number;
  organizer?: { displayName: string };
};

export default function StatementsPage() {
  const [items, setItems] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminJson<Statement[]>("/billing/statements")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/statements" />
      <h1>Statements</h1>
      <p>Месячные отчёты по eligible комиссиям (accrued/approved) с invoice статусом.</p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Организатор</th>
              <th style={{ textAlign: "left", padding: 8 }}>Период</th>
              <th style={{ textAlign: "left", padding: 8 }}>Paid</th>
              <th style={{ textAlign: "left", padding: 8 }}>Refunded</th>
              <th style={{ textAlign: "left", padding: 8 }}>Net</th>
              <th style={{ textAlign: "left", padding: 8 }}>Комиссия</th>
              <th style={{ textAlign: "left", padding: 8 }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{item.organizer?.displayName ?? item.organizerId}</td>
                <td style={{ padding: 8 }}>
                  {new Date(item.periodStart).toLocaleDateString()} - {new Date(item.periodEnd).toLocaleDateString()}
                </td>
                <td style={{ padding: 8 }}>{item.grossPaidRub}</td>
                <td style={{ padding: 8 }}>{item.refundedRub}</td>
                <td style={{ padding: 8 }}>{item.netSalesRub}</td>
                <td style={{ padding: 8 }}>{item.commissionTotalRub}</td>
                <td style={{ padding: 8 }}>{getBillingStatementStatusLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !error && items.length === 0 && <p>Отчётов пока нет.</p>}
    </main>
  );
}
