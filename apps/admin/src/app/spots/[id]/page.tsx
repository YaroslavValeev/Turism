"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminJson, getAdminToken } from "../../../lib/admin";
import { AdminMessage, AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../../../components/admin";
import { SpotSnapshotsTable } from "../../../components/admin/spots/SpotSnapshotsTable";
import {
  AUDIT_STATUS_LABEL,
  DISCOVERY_STATUS_LABEL,
  WATER_BODY_LABEL,
  formatCoordinates,
  parseCoordinates,
  yandexMapsUrl,
} from "../../../components/admin/spots/spotModel";
import type { SpotDetail, SpotUnit } from "../../../components/admin/spots/spotTypes";

type SpotForm = {
  name: string;
  region: string;
  address: string;
  coordinates: string;
  waterBodyType: string;
  relatedToMyWave: boolean;
  discoveryStatus: string;
};

function toForm(spot: SpotDetail): SpotForm {
  return {
    name: spot.name,
    region: spot.region,
    address: spot.address ?? "",
    coordinates: formatCoordinates(spot.latitude, spot.longitude),
    waterBodyType: spot.waterBodyType ?? "",
    relatedToMyWave: spot.relatedToMyWave,
    discoveryStatus: spot.discoveryStatus,
  };
}

const emptyUnit = { serviceName: "Вейксерф", boat: "", model: "", ballast: "" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SpotDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [form, setForm] = useState<SpotForm | null>(null);
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const [auditDates, setAuditDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminJson<SpotDetail>(`/spots/${id}`);
      setSpot(data);
      setForm(toForm(data));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    if (id) void load();
  }, [id, load]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSpot = async () => {
    if (!form) return;
    const coords = parseCoordinates(form.coordinates);
    if (coords === "invalid") {
      setError("Координаты: вставьте как в Яндекс Картах, например «55.751244, 37.618423».");
      return;
    }
    await run(
      () => adminJson(`/spots/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          region: form.region,
          address: form.address || null,
          waterBodyType: form.waterBodyType || null,
          relatedToMyWave: form.relatedToMyWave,
          discoveryStatus: form.discoveryStatus,
          latitude: coords ? coords.latitude : null,
          longitude: coords ? coords.longitude : null,
        }),
      }),
      "Спот сохранён.",
    );
  };

  const createUnit = async () => {
    const equipmentConfig = Object.fromEntries(
      Object.entries({ boat: unitForm.boat, model: unitForm.model, ballast: unitForm.ballast })
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v),
    );
    await run(
      () => adminJson(`/spots/${id}/units`, {
        method: "POST",
        body: JSON.stringify({ serviceName: unitForm.serviceName, equipmentConfig }),
      }),
      "Услуга добавлена.",
    );
    setUnitForm(emptyUnit);
  };

  const createAudit = async (unit: SpotUnit) => {
    const date = auditDates[unit.id] || todayIso();
    await run(
      () => adminJson(`/spots/units/${unit.id}/audits`, {
        method: "POST",
        body: JSON.stringify({
          testedAt: new Date(`${date}T12:00:00Z`).toISOString(),
          methodologyVersion: "v1.1",
          protocolVersion: "wakesurf-v1.1",
          criteriaVersion: "wakesurf-v1.1",
        }),
      }),
      "Аудит создан — откройте его, чтобы заполнить оценки.",
    );
  };

  const toggleUnit = (unit: SpotUnit) =>
    run(
      () => adminJson(`/spots/units/${unit.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !unit.isActive }) }),
      unit.isActive ? "Услуга выключена." : "Услуга включена.",
    );

  if (!spot || !form) {
    return (
      <main className="mw-admin-page">
        <AdminMessage type="error">{error}</AdminMessage>
        {!error ? <p className="mw-admin-caption">Загрузка...</p> : null}
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title={spot.name}
        description={<><Link href="/spots">← Все споты</Link> · {spot.region}</>}
        actions={spot.latitude != null && spot.longitude != null ? (
          <a className="mw-admin-btn mw-admin-btn--ghost" href={yandexMapsUrl(spot.latitude, spot.longitude)} target="_blank" rel="noreferrer">
            Открыть в Яндекс Картах
          </a>
        ) : null}
      />
      <AdminMessage type="error">{error}</AdminMessage>
      <AdminMessage type="success">{success}</AdminMessage>

      <AdminSectionCard title="Данные спота">
        <div className="mw-admin-stack-8">
          <div className="mw-admin-inline-form">
            <input className="mw-admin-input" placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="mw-admin-input" placeholder="Регион" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            <input className="mw-admin-input" placeholder="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="mw-admin-inline-form">
            <input
              className="mw-admin-input"
              placeholder="Координаты: 55.751244, 37.618423"
              value={form.coordinates}
              onChange={(e) => setForm({ ...form, coordinates: e.target.value })}
              style={{ minWidth: 280 }}
            />
            <select className="mw-admin-input" value={form.waterBodyType} onChange={(e) => setForm({ ...form, waterBodyType: e.target.value })}>
              <option value="">Тип водоёма</option>
              {Object.entries(WATER_BODY_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <select className="mw-admin-input" value={form.discoveryStatus} onChange={(e) => setForm({ ...form, discoveryStatus: e.target.value })}>
              {Object.entries(DISCOVERY_STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="mw-admin-inline-form">
              <input type="checkbox" checked={form.relatedToMyWave} onChange={(e) => setForm({ ...form, relatedToMyWave: e.target.checked })} />
              <span className="mw-admin-caption">Связан с MyWave</span>
            </label>
          </div>
          {spot.organizer ? <p className="mw-admin-caption">Организатор: {spot.organizer.displayName}</p> : null}
          <div>
            <button type="button" className="mw-admin-btn" disabled={busy} onClick={() => void saveSpot()}>Сохранить</button>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Новая услуга (единица рейтинга)">
        <p className="mw-admin-caption" style={{ marginTop: 0 }}>
          Рейтинг ставится конкретной конфигурации: одна лодка не описывает весь флот. Для другой лодки заведите отдельную услугу.
        </p>
        <div className="mw-admin-inline-form">
          <input className="mw-admin-input" placeholder="Услуга" value={unitForm.serviceName} onChange={(e) => setUnitForm({ ...unitForm, serviceName: e.target.value })} />
          <input className="mw-admin-input" placeholder="Лодка (марка)" value={unitForm.boat} onChange={(e) => setUnitForm({ ...unitForm, boat: e.target.value })} />
          <input className="mw-admin-input" placeholder="Модель" value={unitForm.model} onChange={(e) => setUnitForm({ ...unitForm, model: e.target.value })} />
          <input className="mw-admin-input" placeholder="Балласт" value={unitForm.ballast} onChange={(e) => setUnitForm({ ...unitForm, ballast: e.target.value })} />
          <button type="button" className="mw-admin-btn" disabled={busy || !unitForm.serviceName.trim()} onClick={() => void createUnit()}>
            Добавить
          </button>
        </div>
      </AdminSectionCard>

      {spot.serviceUnits.map((unit) => (
        <AdminSectionCard key={unit.id} title={`${unit.serviceName}${unit.isActive ? "" : " (выключена)"}`}>
          <p className="mw-admin-caption" style={{ marginTop: 0 }}>
            {Object.entries(unit.equipmentConfig).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") || "Конфигурация не указана"}
            {" · "}
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => void toggleUnit(unit)}>
              {unit.isActive ? "Выключить" : "Включить"}
            </button>
          </p>

          <h3>Аудиты</h3>
          {unit.audits.length === 0 ? <p className="mw-admin-caption">Аудитов нет.</p> : (
            <ul>
              {unit.audits.map((a) => (
                <li key={a.id}>
                  <Link href={`/spots/audits/${a.id}`}>Тест {new Date(a.testedAt).toLocaleDateString("ru-RU")}</Link>{" "}
                  <AdminStatusBadge tone={a.status === "signed" ? "ok" : a.status === "void" ? "danger" : "muted"}>
                    {AUDIT_STATUS_LABEL[a.status] ?? a.status}
                  </AdminStatusBadge>
                </li>
              ))}
            </ul>
          )}
          <div className="mw-admin-inline-form" style={{ marginBottom: 16 }}>
            <span className="mw-admin-caption">Дата теста:</span>
            <input
              type="date"
              className="mw-admin-input"
              value={auditDates[unit.id] ?? todayIso()}
              onChange={(e) => setAuditDates({ ...auditDates, [unit.id]: e.target.value })}
            />
            <button type="button" className="mw-admin-btn" disabled={busy} onClick={() => void createAudit(unit)}>Новый аудит</button>
          </div>

          <h3>Снимки рейтинга</h3>
          <SpotSnapshotsTable
            snapshots={unit.snapshots}
            onChanged={async (message) => { setSuccess(message); await load(); }}
            onError={setError}
          />
        </AdminSectionCard>
      ))}
    </main>
  );
}
