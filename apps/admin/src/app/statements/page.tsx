"use client";

import { getBillingStatementStatusLabel } from "@mywave/shared-types";
import { useEffect, useMemo, useState } from "react";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";
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

function formatRub(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function statementTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "paid") return "ok";
  if (status === "disputed" || status === "void") return "danger";
  if (status === "review" || status === "invoiced") return "warn";
  return "muted";
}

export default function StatementsPage() {
  const [items, setItems] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    adminJson<Statement[]>("/billing/statements")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const statusOptions = useMemo(() => Array.from(new Set(items.map((item) => item.status))).sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => !statusFilter || item.status === statusFilter), [items, statusFilter]);

  const stats = useMemo(() => {
    const netTotal = filtered.reduce((sum, item) => sum + (item.netSalesRub ?? 0), 0);
    const commissionTotal = filtered.reduce((sum, item) => sum + (item.commissionTotalRub ?? 0), 0);
    const paid = filtered.filter((item) => item.status === "paid").length;
    return { count: filtered.length, netTotal, commissionTotal, paid };
  }, [filtered]);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Statements"
        description="Месячные отчёты по eligible комиссиям с invoice-статусом и итогами paid/refunded/net."
      />

      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState label="Загружаем statements…" />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="Отчётов" value={stats.count} />
            <AdminStatCard label="Net (₽)" value={formatRub(stats.netTotal)} />
            <AdminStatCard label="Комиссия (₽)" value={formatRub(stats.commissionTotal)} />
            <AdminStatCard label="Оплачено" value={stats.paid} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Статус statement">
              <select
                className="mw-admin-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">Все</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {getBillingStatementStatusLabel(status)}
                  </option>
                ))}
              </select>
            </AdminFilterField>
          </AdminFiltersBar>

          {filtered.length === 0 ? (
            <AdminEmptyState
              title="Нет отчётов"
              description={statusFilter ? "По выбранному статусу отчётов нет." : "Statements пока не сформированы."}
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Организатор</th>
                    <th>Период</th>
                    <th>Paid</th>
                    <th>Refunded</th>
                    <th>Net</th>
                    <th>Комиссия</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>{item.organizer?.displayName ?? item.organizerId}</td>
                      <td className="mw-admin-muted">
                        {new Date(item.periodStart).toLocaleDateString("ru-RU")} -{" "}
                        {new Date(item.periodEnd).toLocaleDateString("ru-RU")}
                      </td>
                      <td>{formatRub(item.grossPaidRub)}</td>
                      <td>{formatRub(item.refundedRub)}</td>
                      <td>{formatRub(item.netSalesRub)}</td>
                      <td>{formatRub(item.commissionTotalRub)}</td>
                      <td>
                        <AdminStatusBadge tone={statementTone(item.status)}>
                          {getBillingStatementStatusLabel(item.status)}
                        </AdminStatusBadge>
                      </td>
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
