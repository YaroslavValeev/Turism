"use client";

import { useEffect, useState } from "react";
import {
  COMMISSION_RECONCILIATION_STATUSES,
  getCommissionReconciliationStatusLabel,
} from "@mywave/shared-types";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Commission = {
  id: string;
  commissionBaseRub: number;
  commissionRateBps: number;
  commissionAmountRub: number;
  commissionCollectedRub: number | null;
  reconciliationStatus: string;
  createdAt: string;
  booking?: { id: string; bookingStatus: string };
  organizer?: { id: string; displayName: string };
  program?: { id: string; title: string };
};

export default function CommissionsQueuePage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null;
    if (!token) {
      window.location.href = "/login";
      return;
    }
    const q = filter ? `?reconciliation_status=${encodeURIComponent(filter)}` : "";
    fetch(`${API_URL}/commissions${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          window.localStorage.removeItem("admin_token");
          window.location.href = "/login";
          return [];
        }
        return res.json();
      })
      .then((data) => setCommissions(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <main style={{ padding: 24 }}>
      <p>
        <Link href="/organizers">Организаторы</Link> | <Link href="/programs">Программы</Link> | <Link href="/bookings">Заявки</Link> | <Link href="/incidents">Инциденты</Link> | <Link href="/reviews">Отзывы</Link> | <strong>Комиссии</strong>
      </p>
      <h1>Доходы: очередь комиссий</h1>
      <p><em>Продажи и начисления: net-база, ставка и итог комиссии.</em></p>
      <p style={{ fontSize: 14, color: "#555" }}>Начисление и сверка: runbook <code>docs/COMMISSION_RUNBOOK.md</code> (completed booking → POST /commissions → PATCH reconciliation).</p>
      <p>
        Фильтр по статусу сверки:{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 6 }}>
          <option value="">Все</option>
          {COMMISSION_RECONCILIATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getCommissionReconciliationStatusLabel(s)}
            </option>
          ))}
        </select>
      </p>
      {loading && <p>Загрузка…</p>}
      {!loading && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Net база (₽)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Ставка</th>
              <th style={{ textAlign: "left", padding: 8 }}>Комиссия (₽)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Собрано (₽)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Организатор</th>
              <th style={{ textAlign: "left", padding: 8 }}>Программа</th>
              <th style={{ textAlign: "left", padding: 8 }}>Сверка</th>
              <th style={{ textAlign: "left", padding: 8 }}>Создан</th>
            </tr>
          </thead>
          <tbody>
            {commissions.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{c.commissionBaseRub ?? 0}</td>
                <td style={{ padding: 8 }}>{((c.commissionRateBps ?? 300) / 100).toFixed(2)}%</td>
                <td style={{ padding: 8 }}>{c.commissionAmountRub ?? 0}</td>
                <td style={{ padding: 8 }}>{c.commissionCollectedRub ?? "—"}</td>
                <td style={{ padding: 8 }}>{c.organizer?.displayName ?? "—"}</td>
                <td style={{ padding: 8 }}>{c.program?.title ?? "—"}</td>
                <td style={{ padding: 8 }}>{getCommissionReconciliationStatusLabel(c.reconciliationStatus)}</td>
                <td style={{ padding: 8 }}>{new Date(c.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && commissions.length === 0 && <p>Нет записей комиссий.</p>}
    </main>
  );
}
