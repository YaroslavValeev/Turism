"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getBookingStatusLabel, getSourceChannelLabel } from "@mywave/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
    const token = typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null;
    if (!token || !id) {
      if (!token) window.location.href = "/login";
      return;
    }
    fetch(`${API_URL}/bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          window.localStorage.removeItem("admin_token");
          window.location.href = "/login";
          return null;
        }
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data) {
          setBooking(data);
          setSelectedStatus(data.bookingStatus);
        } else setBooking(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = () => {
    if (!booking || selectedStatus === booking.bookingStatus || !booking.nextStatuses.includes(selectedStatus)) return;
    const token = window.localStorage.getItem("admin_token");
    if (!token) return;
    setSaving(true);
    setError("");
    fetch(`${API_URL}/bookings/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bookingStatus: selectedStatus }),
    })
      .then((res) => {
        if (res.status === 401) {
          window.localStorage.removeItem("admin_token");
          window.location.href = "/login";
          return null;
        }
        if (!res.ok) return res.json().then((b) => { setError(b?.error ?? res.statusText); return null; });
        return res.json();
      })
      .then((data) => {
        if (data) {
          setBooking({ ...data, nextStatuses: data.nextStatuses ?? booking?.nextStatuses ?? [] });
        }
      })
      .finally(() => setSaving(false));
  };

  if (loading) return <main style={{ padding: 24 }}><p>Загрузка...</p></main>;
  if (!booking) return <main style={{ padding: 24 }}><p>Заявка не найдена.</p><Link href="/bookings">← К списку</Link></main>;

  const canChange = booking.nextStatuses.length > 0 && booking.nextStatuses.includes(selectedStatus) && selectedStatus !== booking.bookingStatus;

  return (
    <main style={{ padding: 24 }}>
      <p>
        <Link href="/organizers">Организаторы</Link> | <Link href="/programs">Программы</Link> | <Link href="/bookings">Заявки</Link> | <Link href="/incidents">Инциденты</Link> | <Link href="/reviews">Отзывы</Link> | <Link href="/commissions">Комиссии</Link>
      </p>
      <h1>Заявка: {booking.id.slice(0, 8)}…</h1>
      <p><Link href="/bookings">← К списку заявок</Link></p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <tbody>
          <tr><td style={{ padding: 6, fontWeight: "bold" }}>Гость</td><td style={{ padding: 6 }}>{booking.guestContact}</td></tr>
          <tr><td style={{ padding: 6, fontWeight: "bold" }}>Программа</td><td style={{ padding: 6 }}>{booking.program?.title ?? "—"}</td></tr>
          <tr><td style={{ padding: 6, fontWeight: "bold" }}>Организатор</td><td style={{ padding: 6 }}>{booking.organizer?.displayName} ({booking.organizer?.contactEmail})</td></tr>
          <tr><td style={{ padding: 6, fontWeight: "bold" }}>Текущий статус</td><td style={{ padding: 6 }}>{getBookingStatusLabel(booking.bookingStatus)}</td></tr>
          <tr><td style={{ padding: 6, fontWeight: "bold" }}>Источник</td><td style={{ padding: 6 }}>{getSourceChannelLabel(booking.sourceChannel)}</td></tr>
          <tr><td style={{ padding: 6, fontWeight: "bold" }}>Комментарий</td><td style={{ padding: 6, whiteSpace: "pre-wrap" }}>{booking.notes ?? "—"}</td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 24 }}>
        <label style={{ marginRight: 8 }}>Сменить статус:</label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          style={{ padding: 6, marginRight: 8 }}
        >
          <option value={booking.bookingStatus}>{getBookingStatusLabel(booking.bookingStatus)} (текущий)</option>
          {booking.nextStatuses.map((s) => (
            <option key={s} value={s}>{getBookingStatusLabel(s)}</option>
          ))}
        </select>
        <button onClick={handleStatusChange} disabled={!canChange || saving} style={{ padding: 6 }}>
          {saving ? "Сохранение…" : "Применить"}
        </button>
        {booking.nextStatuses.length === 0 && <span style={{ marginLeft: 8, color: "#666" }}>Нет допустимых переходов</span>}
      </div>
    </main>
  );
}
