"use client";

import { useEffect, useState } from "react";
import { getRefundStatusLabel } from "@mywave/shared-types";
import { AdminNav } from "../../components/AdminNav";
import { adminJson } from "../../lib/admin";

type Refund = {
  id: string;
  bookingId: string;
  amountRub: number;
  status: string;
  refundedAt: string;
  reason?: string | null;
};

export default function RefundsPage() {
  const [items, setItems] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminJson<Refund[]>("/refunds")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/refunds" />
      <h1>Возвраты</h1>
      <p>Ручная фиксация возвратов с автоматическим пересчётом net и комиссии.</p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Booking</th>
              <th style={{ textAlign: "left", padding: 8 }}>Сумма</th>
              <th style={{ textAlign: "left", padding: 8 }}>Статус</th>
              <th style={{ textAlign: "left", padding: 8 }}>Причина</th>
              <th style={{ textAlign: "left", padding: 8 }}>Дата</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{item.bookingId}</td>
                <td style={{ padding: 8 }}>{item.amountRub}</td>
                <td style={{ padding: 8 }}>{getRefundStatusLabel(item.status)}</td>
                <td style={{ padding: 8 }}>{item.reason ?? "—"}</td>
                <td style={{ padding: 8 }}>{new Date(item.refundedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !error && items.length === 0 && <p>Возвратов пока нет.</p>}
    </main>
  );
}
