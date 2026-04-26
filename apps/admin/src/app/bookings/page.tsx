"use client";

import { useEffect, useMemo, useState } from "react";
import { BOOKING_STATUSES, getBookingStatusLabel, getSourceChannelLabel } from "@mywave/shared-types";
import Link from "next/link";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Booking = {
  id: string;
  guestContact: string;
  bookingStatus: string;
  sourceChannel: string | null;
  notes: string | null;
  createdAt: string;
  program?: { id: string; title: string; discipline: string };
  organizer?: { id: string; displayName: string };
};

function bookingStatusTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "completed" || status === "paid_full" || status === "booked" || status === "paid_off_platform") return "ok";
  if (
    status.startsWith("cancel")
    || status === "canceled"
    || status.startsWith("refund")
    || status === "disputed"
  ) {
    return "danger";
  }
  if (status === "created" || status === "new" || status === "reviewed" || status === "paid_partial") return "warn";
  return "muted";
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
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
    const q = filter ? `?booking_status=${encodeURIComponent(filter)}` : "";
    fetch(`${API_URL}/bookings${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
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
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  const stats = useMemo(() => {
    const byStatus = BOOKING_STATUSES.reduce(
      (acc, s) => {
        acc[s] = bookings.filter((b) => b.bookingStatus === s).length;
        return acc;
      },
      {} as Record<string, number>,
    );
    return { total: bookings.length, byStatus };
  }, [bookings]);

  const filteredEmpty = !loading && !error && bookings.length === 0;

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Заявки"
        description="Очередь бронирований: статус, источник лида и быстрый переход к смене статуса на карточке заявки."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="В списке" value={stats.total} hint={filter ? `Фильтр: ${getBookingStatusLabel(filter)}` : "Все статусы"} />
            <AdminStatCard
              label="Ранняя воронка"
              value={(stats.byStatus.created ?? 0) + (stats.byStatus.new ?? 0) + (stats.byStatus.reviewed ?? 0)}
              hint="created + new + reviewed"
            />
            <AdminStatCard label="Завершённые" value={stats.byStatus.completed ?? 0} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Статус заявки">
              <select className="mw-admin-input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 240 }}>
                <option value="">Все</option>
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {getBookingStatusLabel(s)}
                  </option>
                ))}
              </select>
            </AdminFilterField>
          </AdminFiltersBar>

          {filteredEmpty ? (
            <AdminEmptyState
              title="Нет заявок"
              description={
                filter
                  ? "По выбранному статусу записей нет. Сбросьте фильтр или проверьте другой этап воронки."
                  : "В системе пока нет заявок с учётом текущего доступа."
              }
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Гость</th>
                    <th>Программа</th>
                    <th>Организатор</th>
                    <th>Статус</th>
                    <th>Источник</th>
                    <th>Создана</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.guestContact}</td>
                      <td>{b.program?.title ?? b.id.slice(0, 8)}</td>
                      <td className="mw-admin-muted">{b.organizer?.displayName ?? "—"}</td>
                      <td>
                        <AdminStatusBadge tone={bookingStatusTone(b.bookingStatus)}>
                          {getBookingStatusLabel(b.bookingStatus)}
                        </AdminStatusBadge>
                      </td>
                      <td>
                        <div>{getSourceChannelLabel(b.sourceChannel)}</div>
                        {b.notes ? (
                          <div className="mw-admin-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
                            {b.notes.slice(0, 80)}
                            {b.notes.length > 80 ? "…" : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="mw-admin-muted">{new Date(b.createdAt).toLocaleString("ru-RU")}</td>
                      <td>
                        <Link className="mw-admin-btn mw-admin-btn--ghost" href={`/bookings/${b.id}`} style={{ fontSize: "0.82rem", padding: "6px 12px" }}>
                          Открыть
                        </Link>
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
