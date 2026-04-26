"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  INCIDENT_STATUSES,
  getBookingStatusLabel,
  getIncidentStatusLabel,
  getIncidentTypeLabel,
  getSeverityLabel,
} from "@mywave/shared-types";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

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

  const loadIncidents = async () => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = filter ? `?incident_status=${encodeURIComponent(filter)}` : "";
      const list = await adminJson<Incident[]>(`/incidents${q}`);
      setIncidents(list);
      setStatusDrafts(Object.fromEntries(list.map((incident) => [incident.id, incident.incidentStatus])));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  const loadReferences = async () => {
    if (!getAdminToken()) return;
    try {
      const [organizerList, programList, bookingList] = await Promise.all([
        adminJson<OrganizerOption[]>("/organizers"),
        adminJson<ProgramOption[]>("/programs?all=1"),
        adminJson<BookingOption[]>("/bookings"),
      ]);
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
    void loadIncidents();
  }, [filter]);

  useEffect(() => {
    void loadReferences();
  }, []);

  const stats = useMemo(() => {
    const highRisk = incidents.filter((i) => i.severity === "high" || i.severity === "critical").length;
    const open = incidents.filter((i) => i.incidentStatus === "open" || i.incidentStatus === "investigating").length;
    const resolved = incidents.filter((i) => i.incidentStatus === "resolved" || i.incidentStatus === "closed").length;
    return { total: incidents.length, highRisk, open, resolved };
  }, [incidents]);

  function incidentStatusTone(status: string): "ok" | "warn" | "danger" | "muted" {
    if (status === "resolved" || status === "closed") return "ok";
    if (status === "escalated") return "danger";
    if (status === "open" || status === "investigating" || status === "triaged") return "warn";
    return "muted";
  }

  const handleCreateIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!getAdminToken()) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      await adminJson("/incidents", {
        method: "POST",
        body: JSON.stringify({
          organizerId: createForm.organizerId,
          programId: createForm.programId || undefined,
          bookingId: createForm.bookingId || undefined,
          type: createForm.type.trim(),
          severity: createForm.severity,
          summary: createForm.summary.trim(),
        }),
      });
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
    if (!getAdminToken()) return;
    setSavingId(incidentId);
    setError("");
    setMessage("");
    try {
      await adminJson(`/incidents/${incidentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ incidentStatus: statusDrafts[incidentId] }),
      });
      setMessage("Статус инцидента обновлён.");
      await loadIncidents();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить статус инцидента");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Очередь инцидентов"
        description="Регистрация жалоб и рисков по безопасности. Случаи high/critical разбираем до расширения каталога."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      {!loading && (
        <AdminStatGrid>
          <AdminStatCard label="Всего" value={stats.total} />
          <AdminStatCard label="Открыто / в работе" value={stats.open} />
          <AdminStatCard label="Высокий и критичный риск" value={stats.highRisk} />
          <AdminStatCard label="Решено / закрыто" value={stats.resolved} />
        </AdminStatGrid>
      )}

      <AdminSectionCard title="Зарегистрировать инцидент">
        <form className="mw-admin-form-grid" onSubmit={handleCreateIncident}>
          <select
            className="mw-admin-input"
            value={createForm.organizerId}
            onChange={(e) => setCreateForm((current) => ({ ...current, organizerId: e.target.value }))}
          >
            <option value="">Организатор</option>
            {organizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.displayName}
              </option>
            ))}
          </select>
          <select
            className="mw-admin-input"
            value={createForm.programId}
            onChange={(e) => setCreateForm((current) => ({ ...current, programId: e.target.value }))}
          >
            <option value="">Программа (по желанию)</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title}
              </option>
            ))}
          </select>
          <select
            className="mw-admin-input"
            value={createForm.bookingId}
            onChange={(e) => setCreateForm((current) => ({ ...current, bookingId: e.target.value }))}
          >
            <option value="">Заявка (по желанию)</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.guestContact} · {getBookingStatusLabel(booking.bookingStatus)}
              </option>
            ))}
          </select>
          <select
            className="mw-admin-input"
            value={createForm.type}
            onChange={(e) => setCreateForm((current) => ({ ...current, type: e.target.value }))}
          >
            {INCIDENT_TYPES.map((incidentType) => (
              <option key={incidentType} value={incidentType}>
                {getIncidentTypeLabel(incidentType)}
              </option>
            ))}
          </select>
          <select
            className="mw-admin-input"
            value={createForm.severity}
            onChange={(e) => setCreateForm((current) => ({ ...current, severity: e.target.value }))}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {getSeverityLabel(severity)}
              </option>
            ))}
          </select>
          <textarea
            className="mw-admin-textarea mw-admin-form-span-2"
            value={createForm.summary}
            onChange={(e) => setCreateForm((current) => ({ ...current, summary: e.target.value }))}
            placeholder="Краткое описание"
            rows={3}
          />
          <button
            type="submit"
            className="mw-admin-btn"
            disabled={creating || !createForm.organizerId || !createForm.type.trim() || !createForm.summary.trim()}
          >
            {creating ? "Создаём…" : "Создать инцидент"}
          </button>
        </form>
      </AdminSectionCard>

      <AdminFiltersBar title="Фильтры">
        <AdminFilterField label="Статус инцидента">
          <select className="mw-admin-input mw-admin-minw-220" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Все</option>
            {INCIDENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getIncidentStatusLabel(status)}
              </option>
            ))}
          </select>
        </AdminFilterField>
      </AdminFiltersBar>

      {loading ? (
        <AdminLoadingState label="Загружаем инциденты…" />
      ) : incidents.length === 0 ? (
        <AdminEmptyState
          title="Нет инцидентов"
          description={filter ? "По выбранному статусу инцидентов нет." : "Очередь инцидентов пока пуста."}
        />
      ) : (
        <div className="mw-admin-table-outer">
          <table className="mw-admin-table">
            <thead>
              <tr>
                <th>Тип и серьёзность</th>
                <th>Описание</th>
                <th>Организатор</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <div>{getIncidentTypeLabel(incident.type)}</div>
                    <div className="mw-admin-muted mw-admin-mt-4">{getSeverityLabel(incident.severity)}</div>
                  </td>
                  <td className="mw-admin-td-wrap mw-admin-minw-320">
                    {incident.summary.slice(0, 90)}
                    {incident.summary.length > 90 ? "…" : ""}
                  </td>
                  <td className="mw-admin-muted">{incident.organizer?.displayName ?? "—"}</td>
                  <td>
                    <div className="mw-admin-mb-6">
                      <AdminStatusBadge tone={incidentStatusTone(incident.incidentStatus)}>
                        {getIncidentStatusLabel(incident.incidentStatus)}
                      </AdminStatusBadge>
                    </div>
                    <select
                      className="mw-admin-input mw-admin-minw-180"
                      value={statusDrafts[incident.id] ?? incident.incidentStatus}
                      onChange={(e) => setStatusDrafts((current) => ({ ...current, [incident.id]: e.target.value }))}
                    >
                      {INCIDENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {getIncidentStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="mw-admin-muted">{new Date(incident.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="mw-admin-actions-col">
                    <button
                      type="button"
                      className="mw-admin-btn mw-admin-btn--ghost"
                      onClick={() => void handleSaveStatus(incident.id)}
                      disabled={savingId === incident.id || (statusDrafts[incident.id] ?? incident.incidentStatus) === incident.incidentStatus}
                    >
                      {savingId === incident.id ? "Сохраняем…" : "Сохранить"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
