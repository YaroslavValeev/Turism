"use client";

import { getRefundStatusLabel } from "@mywave/shared-types";
import { useEffect, useMemo, useState } from "react";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";
import { adminJson } from "../../lib/admin";

type Refund = {
  id: string;
  bookingId: string;
  amountRub: number;
  status: string;
  refundedAt: string;
  reason?: string | null;
};

function formatRub(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

function refundTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "completed") return "ok";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "recorded") return "warn";
  return "muted";
}

export default function RefundsPage() {
  const [items, setItems] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    adminJson<Refund[]>("/refunds")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const statusOptions = useMemo(() => Array.from(new Set(items.map((item) => item.status))).sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => !statusFilter || item.status === statusFilter), [items, statusFilter]);

  const stats = useMemo(() => {
    const total = filtered.reduce((sum, item) => sum + (item.amountRub ?? 0), 0);
    const completed = filtered.filter((item) => item.status === "completed").length;
    const failed = filtered.filter((item) => item.status === "failed").length;
    return { count: filtered.length, total, completed, failed };
  }, [filtered]);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Возвраты"
        description="Ручная фиксация возвратов с пересчётом net-продаж и влиянием на комиссию."
      />

      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState label="Загружаем возвраты…" />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="Записей" value={stats.count} />
            <AdminStatCard label="Сумма возвратов (₽)" value={formatRub(stats.total)} />
            <AdminStatCard label="Выполнено" value={stats.completed} />
            <AdminStatCard label="Ошибки" value={stats.failed} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Статус возврата">
              <select
                className="mw-admin-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">Все</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {getRefundStatusLabel(status)}
                  </option>
                ))}
              </select>
            </AdminFilterField>
          </AdminFiltersBar>

          {filtered.length === 0 ? (
            <AdminEmptyState
              title="Нет возвратов"
              description={statusFilter ? "По выбранному статусу возвратов нет." : "В системе пока нет возвратов."}
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th>Причина</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td className="mw-admin-code">{item.bookingId}</td>
                      <td>{formatRub(item.amountRub)} ₽</td>
                      <td>
                        <AdminStatusBadge tone={refundTone(item.status)}>{getRefundStatusLabel(item.status)}</AdminStatusBadge>
                      </td>
                      <td className="mw-admin-muted">{item.reason ?? "—"}</td>
                      <td className="mw-admin-muted">{new Date(item.refundedAt).toLocaleString("ru-RU")}</td>
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
