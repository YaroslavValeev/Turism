"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COMMISSION_RECONCILIATION_STATUSES,
  getCommissionReconciliationStatusLabel,
} from "@mywave/shared-types";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

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
  const [error, setError] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null;
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    const q = filter ? `?reconciliation_status=${encodeURIComponent(filter)}` : "";
    fetch(`${API_URL}/commissions${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          window.localStorage.removeItem("admin_token");
          window.location.href = "/login";
          return [];
        }
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(t || res.statusText);
          });
        }
        return res.json();
      })
      .then((data) => setCommissions(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  const stats = useMemo(() => {
    const totalBase = commissions.reduce((sum, c) => sum + (c.commissionBaseRub ?? 0), 0);
    const totalCommission = commissions.reduce((sum, c) => sum + (c.commissionAmountRub ?? 0), 0);
    const collected = commissions.filter((c) => c.reconciliationStatus === "paid").length;
    const disputed = commissions.filter((c) => c.reconciliationStatus === "disputed").length;
    return { count: commissions.length, totalBase, totalCommission, collected, disputed };
  }, [commissions]);

  function reconciliationTone(status: string): "ok" | "warn" | "danger" | "muted" {
    if (status === "paid") return "ok";
    if (status === "disputed" || status === "reversed" || status === "written_off") return "danger";
    if (status === "pending_evidence" || status === "accrued" || status === "approved" || status === "invoiced") {
      return "warn";
    }
    return "muted";
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Доходы: очередь комиссий"
        description="Продажи и начисления: net-база, ставка и итог комиссии. Runbook: docs/COMMISSION_RUNBOOK.md."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState label="Загружаем комиссии…" />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="Записей" value={stats.count} />
            <AdminStatCard label="Net база (₽)" value={new Intl.NumberFormat("ru-RU").format(stats.totalBase)} />
            <AdminStatCard label="Комиссия (₽)" value={new Intl.NumberFormat("ru-RU").format(stats.totalCommission)} />
            <AdminStatCard label="Paid / disputed" value={`${stats.collected} / ${stats.disputed}`} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Статус сверки">
              <select className="mw-admin-input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 240 }}>
                <option value="">Все</option>
                {COMMISSION_RECONCILIATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {getCommissionReconciliationStatusLabel(s)}
                  </option>
                ))}
              </select>
            </AdminFilterField>
          </AdminFiltersBar>

          {commissions.length === 0 ? (
            <AdminEmptyState title="Нет записей комиссий" description="По текущему фильтру или в целом очередь комиссий пуста." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Net база (₽)</th>
                    <th>Ставка</th>
                    <th>Комиссия (₽)</th>
                    <th>Собрано (₽)</th>
                    <th>Организатор</th>
                    <th>Программа</th>
                    <th>Сверка</th>
                    <th>Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id}>
                      <td>{new Intl.NumberFormat("ru-RU").format(c.commissionBaseRub ?? 0)}</td>
                      <td>{((c.commissionRateBps ?? 300) / 100).toFixed(2)}%</td>
                      <td>{new Intl.NumberFormat("ru-RU").format(c.commissionAmountRub ?? 0)}</td>
                      <td>{c.commissionCollectedRub == null ? "—" : new Intl.NumberFormat("ru-RU").format(c.commissionCollectedRub)}</td>
                      <td className="mw-admin-muted">{c.organizer?.displayName ?? "—"}</td>
                      <td className="mw-admin-muted">{c.program?.title ?? "—"}</td>
                      <td>
                        <AdminStatusBadge tone={reconciliationTone(c.reconciliationStatus)}>
                          {getCommissionReconciliationStatusLabel(c.reconciliationStatus)}
                        </AdminStatusBadge>
                      </td>
                      <td className="mw-admin-muted">{new Date(c.createdAt).toLocaleString("ru-RU")}</td>
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
