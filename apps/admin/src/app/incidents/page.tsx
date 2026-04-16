"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  INCIDENT_STATUSES,
  getBookingStatusLabel,
  getIncidentStatusLabel,
  getIncidentTypeLabel,
  getSeverityLabel,
} from "@mywave/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT_TYPES = ["complaint", "safety", "medical", "logistics", "payment", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];

type OrganizerOption = {
  id: string;
  displayName: string;
};

type ProgramOption = {
  id: string;
  title: string;
};

type BookingOption = {
  id: string;
  guestContact: string;
  bookingStatus: string;
};

type Incident = {
  id: string;
  type: string;
  severity: string;
  summary: string;
  incidentStatus: string;
  createdAt: string;
  organizer?: { id: string; displayName: string };
  program?: { id: string; title: string };
  booking?: { id: string; bookingStatus: string };
};

type CreateIncidentForm = {
  organizerId: string;
  programId: string;
  bookingId: string;
  type: string;
  severity: string;
  summary: string;
};

export default function IncidentsQueuePage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState<CreateIncidentForm>({
    organizerId: "",
    programId: "",
    bookingId: "",
    type: "complaint",
    severity: "medium",
    summary: "",
  });
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const getToken = () => (typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null);

  const loadIncidents = async () => {
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = filter ? `?incident_status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`${API_URL}/incidents${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        window.localStorage.removeItem("admin_token");
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setIncidents(list);
      setStatusDrafts(Object.fromEntries(list.map((incident) => [incident.id, incident.incidentStatus])));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  const loadReferences = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [organizersRes, programsRes, bookingsRes] = await Promise.all([
        fetch(`${API_URL}/organizers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/programs?all=1`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/bookings`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [organizersData, programsData, bookingsData] = await Promise.all([
        organizersRes.json(),
        programsRes.json(),
        bookingsRes.json(),
      ]);
      const organizerList = Array.isArray(organizersData) ? organizersData : [];
      const programList = Array.isArray(programsData) ? programsData : [];
      const bookingList = Array.isArray(bookingsData) ? bookingsData : [];
      setOrganizers(organizerList);
      setPrograms(programList);
      setBookings(bookingList);
      setCreateForm((current) => ({
        ...current,
        organizerId: current.organizerId || organizerList[0]?.id || "",
      }));
    } catch {
      setOrganizers([]);
      setPrograms([]);
      setBookings([]);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [filter]);

  useEffect(() => {
    loadReferences();
  }, []);

  const handleCreateIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organizerId: createForm.organizerId,
          programId: createForm.programId || undefined,
          bookingId: createForm.bookingId || undefined,
          type: createForm.type.trim(),
          severity: createForm.severity,
          summary: createForm.summary.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось создать инцидент");
      }
      setMessage("Инцидент создан.");
      setCreateForm((current) => ({ ...current, summary: "", bookingId: "", programId: "" }));
      await loadIncidents();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать инцидент");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveStatus = async (incidentId: string) => {
    const token = getToken();
    if (!token) return;
    setSavingId(incidentId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ incidentStatus: statusDrafts[incidentId] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось обновить статус инцидента");
      }
      setMessage("Статус инцидента обновлён.");
      await loadIncidents();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить статус инцидента");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <p>
        <Link href="/organizers">Организаторы</Link> | <Link href="/programs">Программы</Link> | <Link href="/bookings">Заявки</Link> | <strong>Инциденты</strong> | <Link href="/reviews">Отзывы</Link> | <Link href="/commissions">Комиссии</Link>
      </p>
      <h1>Очередь инцидентов</h1>
      <p style={{ fontSize: 14, color: "#555" }}>
        Здесь фиксируются все жалобы и кейсы безопасности. Инциденты с высоким и критическим приоритетом должны быть разобраны до решения о расширении каталога.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "#1d6f42" }}>{message}</p>}

      <section style={{ margin: "20px 0", padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Завести инцидент</h2>
        <form onSubmit={handleCreateIncident} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <select value={createForm.organizerId} onChange={(e) => setCreateForm((current) => ({ ...current, organizerId: e.target.value }))} style={{ padding: 10 }}>
            <option value="">Организатор</option>
            {organizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>{organizer.displayName}</option>
            ))}
          </select>
          <select value={createForm.programId} onChange={(e) => setCreateForm((current) => ({ ...current, programId: e.target.value }))} style={{ padding: 10 }}>
            <option value="">Программа (опционально)</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>{program.title}</option>
            ))}
          </select>
          <select value={createForm.bookingId} onChange={(e) => setCreateForm((current) => ({ ...current, bookingId: e.target.value }))} style={{ padding: 10 }}>
            <option value="">Заявка (опционально)</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>{booking.guestContact} · {getBookingStatusLabel(booking.bookingStatus)}</option>
            ))}
          </select>
          <select value={createForm.type} onChange={(e) => setCreateForm((current) => ({ ...current, type: e.target.value }))} style={{ padding: 10 }}>
            {INCIDENT_TYPES.map((incidentType) => (
              <option key={incidentType} value={incidentType}>{getIncidentTypeLabel(incidentType)}</option>
            ))}
          </select>
          <select value={createForm.severity} onChange={(e) => setCreateForm((current) => ({ ...current, severity: e.target.value }))} style={{ padding: 10 }}>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>{getSeverityLabel(severity)}</option>
            ))}
          </select>
          <textarea value={createForm.summary} onChange={(e) => setCreateForm((current) => ({ ...current, summary: e.target.value }))} placeholder="Краткое описание" rows={3} style={{ padding: 10 }} />
          <button type="submit" disabled={creating || !createForm.organizerId || !createForm.type.trim() || !createForm.summary.trim()} style={{ padding: 10 }}>
            {creating ? "Создание..." : "Создать инцидент"}
          </button>
        </form>
      </section>

      <p>
        Фильтр по статусу:{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 6 }}>
          <option value="">Все</option>
          {INCIDENT_STATUSES.map((status) => (
            <option key={status} value={status}>{getIncidentStatusLabel(status)}</option>
          ))}
        </select>
      </p>
      {loading && <p>Загрузка…</p>}
      {!loading && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Тип / приоритет</th>
              <th style={{ textAlign: "left", padding: 8 }}>Описание</th>
              <th style={{ textAlign: "left", padding: 8 }}>Организатор</th>
              <th style={{ textAlign: "left", padding: 8 }}>Статус</th>
              <th style={{ textAlign: "left", padding: 8 }}>Создан</th>
              <th style={{ textAlign: "left", padding: 8 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{getIncidentTypeLabel(incident.type)} / {getSeverityLabel(incident.severity)}</td>
                <td style={{ padding: 8, maxWidth: 300 }}>{incident.summary.slice(0, 80)}{incident.summary.length > 80 ? "…" : ""}</td>
                <td style={{ padding: 8 }}>{incident.organizer?.displayName ?? "—"}</td>
                <td style={{ padding: 8 }}>
                  <select
                    value={statusDrafts[incident.id] ?? incident.incidentStatus}
                    onChange={(e) => setStatusDrafts((current) => ({ ...current, [incident.id]: e.target.value }))}
                    style={{ padding: 6 }}
                  >
                    {INCIDENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{getIncidentStatusLabel(status)}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 8 }}>{new Date(incident.createdAt).toLocaleString("ru-RU")}</td>
                <td style={{ padding: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleSaveStatus(incident.id)}
                    disabled={savingId === incident.id || (statusDrafts[incident.id] ?? incident.incidentStatus) === incident.incidentStatus}
                    style={{ padding: "6px 10px" }}
                  >
                    {savingId === incident.id ? "Сохраняем..." : "Сохранить"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && incidents.length === 0 && <p>Нет инцидентов.</p>}
    </main>
  );
}
