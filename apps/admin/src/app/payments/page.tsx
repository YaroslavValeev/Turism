"use client";

import { getPaymentStatusLabel } from "@mywave/shared-types";
import { useEffect, useMemo, useState } from "react";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";
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

function formatRub(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

function paymentTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "confirmed") return "ok";
  if (status === "failed" || status === "reversed") return "danger";
  if (status === "recorded") return "warn";
  return "muted";
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    adminJson<Payment[]>("/payments")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.status))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => !statusFilter || item.status === statusFilter);
  }, [items, statusFilter]);

  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((sum, item) => sum + (item.amountRub ?? 0), 0);
    const confirmed = filtered.filter((item) => item.status === "confirmed").length;
    const failed = filtered.filter((item) => item.status === "failed" || item.status === "reversed").length;
    return { count: filtered.length, totalAmount, confirmed, failed };
  }, [filtered]);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Платежи"
        description="Ручная фиксация оплат для расчёта комиссии на net-сумме и последующей сверки в statements."
      />

      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState label="Загружаем платежи…" />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="Записей" value={stats.count} />
            <AdminStatCard label="Сумма (₽)" value={formatRub(stats.totalAmount)} />
            <AdminStatCard label="Подтверждено" value={stats.confirmed} />
            <AdminStatCard label="Ошибки / сторно" value={stats.failed} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Статус">
              <select
                className="mw-admin-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">Все</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {getPaymentStatusLabel(status)}
                  </option>
                ))}
              </select>
            </AdminFilterField>
          </AdminFiltersBar>

          {filtered.length === 0 ? (
            <AdminEmptyState
              title="Нет платежей"
              description={statusFilter ? "По выбранному статусу платежей нет." : "В системе пока нет зафиксированных оплат."}
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th>Тип</th>
                    <th>Метод</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td className="mw-admin-code">{item.bookingId}</td>
                      <td>{formatRub(item.amountRub)} ₽</td>
                      <td>
                        <AdminStatusBadge tone={paymentTone(item.status)}>
                          {getPaymentStatusLabel(item.status)}
                        </AdminStatusBadge>
                      </td>
                      <td className="mw-admin-muted">{item.paymentKind}</td>
                      <td className="mw-admin-muted">{item.paymentMethod ?? "—"}</td>
                      <td className="mw-admin-muted">{new Date(item.paidAt).toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
