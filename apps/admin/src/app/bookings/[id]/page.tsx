"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getBookingStatusLabel, getSourceChannelLabel } from "@mywave/shared-types";
import { adminJson, getAdminToken } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";

type BookingDetail = {
  id: string;
  guestContact: string;
  bookingStatus: string;
  nextStatuses: string[];
  sourceChannel?: string | null;
  notes?: string | null;
  createdAt: string;
  program?: { id: string; title: string };
  organizer?: { id: string; displayName: string; contactEmail: string };
};

export default function BookingDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    if (!id) return;
    setLoading(true);
    setError("");
    adminJson<BookingDetail>(`/bookings/${id}`)
      .then((data) => {
        setBooking(data);
        setSelectedStatus(data.bookingStatus);
      })
      .catch((e) => {
        setBooking(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = () => {
    if (!booking || selectedStatus === booking.bookingStatus || !booking.nextStatuses.includes(selectedStatus)) return;
    setSaving(true);
    setError("");
    adminJson<BookingDetail>(`/bookings/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ bookingStatus: selectedStatus }),
    })
      .then((data) => {
        setBooking({ ...data, nextStatuses: data.nextStatuses ?? booking.nextStatuses ?? [] });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <main className="mw-admin-page">
        <AdminPageHeader title="Заявка" description="Загрузка карточки бронирования…" />
        <AdminLoadingState />
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="mw-admin-page">
        <AdminPageHeader
          title="Заявка"
          description="Карточка не найдена или нет доступа."
          actions={
            <Link className="mw-admin-btn mw-admin-btn--ghost" href="/bookings">
              ← К списку
            </Link>
          }
        />
        {error ? <div className="mw-admin-alert mw-admin-alert--error">{error}</div> : null}
      </main>
    );
  }

  const canChange =
    booking.nextStatuses.length > 0 &&
    booking.nextStatuses.includes(selectedStatus) &&
    selectedStatus !== booking.bookingStatus;

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title={`Заявка ${booking.id.slice(0, 8)}…`}
        description={`Создана: ${new Date(booking.createdAt).toLocaleString("ru-RU")}`}
        actions={
          <Link className="mw-admin-btn mw-admin-btn--ghost" href="/bookings">
            ← К списку заявок
          </Link>
        }
      />

      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}

      <AdminSectionCard title="Данные заявки" style={{ marginBottom: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="mw-admin-table" style={{ margin: 0, maxWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: 200 }}>Поле</th>
                <th>Значение</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--mw-muted2)", fontSize: "0.82rem" }}>Гость</td>
                <td>{booking.guestContact}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--mw-muted2)", fontSize: "0.82rem" }}>Программа</td>
                <td>{booking.program?.title ?? "—"}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--mw-muted2)", fontSize: "0.82rem" }}>Организатор</td>
                <td>
                  {booking.organizer?.displayName ?? "—"}{" "}
                  {booking.organizer?.contactEmail ? (
                    <span className="mw-admin-prose">({booking.organizer.contactEmail})</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--mw-muted2)", fontSize: "0.82rem" }}>Статус</td>
                <td>{getBookingStatusLabel(booking.bookingStatus)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--mw-muted2)", fontSize: "0.82rem" }}>Источник</td>
                <td>{getSourceChannelLabel(booking.sourceChannel)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, color: "var(--mw-muted2)", fontSize: "0.82rem", verticalAlign: "top" }}>
                  Комментарий
                </td>
                <td style={{ whiteSpace: "pre-wrap" }}>{booking.notes ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Смена статуса">
        <div className="mw-admin-toolbar" style={{ marginBottom: 0 }}>
          <label className="mw-admin-label" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
            Новый статус
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value={booking.bookingStatus}>{getBookingStatusLabel(booking.bookingStatus)} (текущий)</option>
              {booking.nextStatuses.map((s) => (
                <option key={s} value={s}>
                  {getBookingStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="mw-admin-toolbar__actions" style={{ alignSelf: "flex-end" }}>
            <button type="button" className="mw-admin-btn" onClick={handleStatusChange} disabled={!canChange || saving}>
              {saving ? "Сохранение…" : "Применить"}
            </button>
          </div>
        </div>
        {booking.nextStatuses.length === 0 && (
          <p className="mw-admin-prose" style={{ margin: "12px 0 0" }}>
            Нет допустимых переходов для этого статуса.
          </p>
        )}
      </AdminSectionCard>
    </main>
  );
}
