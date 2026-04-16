"use client";

import { useEffect, useState } from "react";
import { getPaymentStatusLabel } from "@mywave/shared-types";
import { AdminNav } from "../../components/AdminNav";
import { adminJson } from "../../lib/admin";

type Payment = {
  id: string;
  bookingId: string;
  amountRub: number;
  status: string;
  paymentKind: string;
  paidAt: string;
  externalReference?: string | null;
  paymentMethod?: string | null;
};

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminJson<Payment[]>("/payments")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/payments" />
      <h1>Платежи</h1>
      <p>Ручная фиксация оплат для расчёта комиссии 3% с net-суммы.</p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Booking</th>
              <th style={{ textAlign: "left", padding: 8 }}>Сумма</th>
              <th style={{ textAlign: "left", padding: 8 }}>Статус</th>
              <th style={{ textAlign: "left", padding: 8 }}>Тип</th>
              <th style={{ textAlign: "left", padding: 8 }}>Метод</th>
              <th style={{ textAlign: "left", padding: 8 }}>Дата</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{item.bookingId}</td>
                <td style={{ padding: 8 }}>{item.amountRub}</td>
                <td style={{ padding: 8 }}>{getPaymentStatusLabel(item.status)}</td>
                <td style={{ padding: 8 }}>{item.paymentKind}</td>
                <td style={{ padding: 8 }}>{item.paymentMethod ?? "—"}</td>
                <td style={{ padding: 8 }}>{new Date(item.paidAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !error && items.length === 0 && <p>Платежей пока нет.</p>}
    </main>
  );
}
