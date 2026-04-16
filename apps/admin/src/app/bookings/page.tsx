"use client";

import { useEffect, useState } from "react";
import { BOOKING_STATUSES, getBookingStatusLabel, getSourceChannelLabel } from "@mywave/shared-types";
import Link from "next/link";

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

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null;
    if (!token) {
      window.location.href = "/login";
      return;
    }
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
        return res.json();
      })
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <main style={{ padding: 24 }}>
      <p>
        <Link href="/organizers">Организаторы</Link> | <Link href="/programs">Программы</Link> | <strong>Заявки</strong> | <Link href="/incidents">Инциденты</Link> | <Link href="/reviews">Отзывы</Link> | <Link href="/commissions">Комиссии</Link>
      </p>
      <h1>Очередь заявок</h1>
      <p>
        Фильтр по статусу:{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 6 }}>
          <option value="">Все</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>{getBookingStatusLabel(s)}</option>
          ))}
        </select>
      </p>
      {loading && <p>Загрузка...</p>}
      {!loading && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Гость</th>
              <th style={{ textAlign: "left", padding: 8 }}>Программа</th>
              <th style={{ textAlign: "left", padding: 8 }}>Организатор</th>
              <th style={{ textAlign: "left", padding: 8 }}>Статус</th>
              <th style={{ textAlign: "left", padding: 8 }}>Источник</th>
              <th style={{ textAlign: "left", padding: 8 }}>Создана</th>
              <th style={{ textAlign: "left", padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{b.guestContact}</td>
                <td style={{ padding: 8 }}>{b.program?.title ?? b.id}</td>
                <td style={{ padding: 8 }}>{b.organizer?.displayName ?? ""}</td>
                <td style={{ padding: 8 }}>{getBookingStatusLabel(b.bookingStatus)}</td>
                <td style={{ padding: 8 }}>
                  <div>{getSourceChannelLabel(b.sourceChannel)}</div>
                  <div style={{ color: "#666", fontSize: 12 }}>{b.notes ? b.notes.slice(0, 50) : ""}</div>
                </td>
                <td style={{ padding: 8 }}>{new Date(b.createdAt).toLocaleString("ru-RU")}</td>
                <td style={{ padding: 8 }}><Link href={`/bookings/${b.id}`}>Открыть / сменить статус</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && bookings.length === 0 && <p>Нет заявок.</p>}
    </main>
  );
}
