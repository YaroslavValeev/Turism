"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminMessage, AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../../components/admin";
import {
  DISCOVERY_STATUS_LABEL,
  WATER_BODY_LABEL,
  parseCoordinates,
  yandexMapsUrl,
} from "../../components/admin/spots/spotModel";
import type { SpotRow } from "../../components/admin/spots/spotTypes";
import { CandidateImportCard } from "../../components/admin/spots/CandidateImportCard";
import { MethodologyRegistryCard } from "../../components/admin/spots/MethodologyRegistryCard";

const emptyForm = { name: "", region: "", address: "", coordinates: "", waterBodyType: "", relatedToMyWave: false };

export default function SpotsPage() {
  const [rows, setRows] = useState<SpotRow[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminJson<{ items: SpotRow[] }>(`/spots${status ? `?status=${status}` : ""}`);
      setRows(data.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [status]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, [load]);

  const create = async () => {
    setSuccess("");
    const coords = parseCoordinates(form.coordinates);
    if (coords === "invalid") {
      setError("Координаты: вставьте как в Яндекс Картах, например «55.751244, 37.618423».");
      return;
    }
    setSaving(true);
    try {
      const spot = await adminJson<SpotRow>("/spots", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          region: form.region,
          address: form.address || null,
          waterBodyType: form.waterBodyType || null,
          relatedToMyWave: form.relatedToMyWave,
          ...(coords ? coords : {}),
        }),
      });
      setForm(emptyForm);
      setSuccess(`Спот «${spot.name}» создан.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Spot Map: споты"
        description="Реестр мест для вейксерфа. Официальный рейтинг ставится услуге на споте после профессионального аудита; отзывы, спонсорство и оплата на него не влияют."
      />
      <AdminMessage type="error">{error}</AdminMessage>
      <AdminMessage type="success">{success}</AdminMessage>

      <AdminSectionCard title="Новый спот">
        <div className="mw-admin-stack-8">
          <div className="mw-admin-inline-form">
            <input className="mw-admin-input" placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="mw-admin-input" placeholder="Регион" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            <input className="mw-admin-input" placeholder="Адрес (необязательно)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="mw-admin-inline-form">
            <input
              className="mw-admin-input"
              placeholder="Координаты из Яндекс Карт: 55.751244, 37.618423"
              value={form.coordinates}
              onChange={(e) => setForm({ ...form, coordinates: e.target.value })}
              style={{ minWidth: 320 }}
            />
            <select className="mw-admin-input" value={form.waterBodyType} onChange={(e) => setForm({ ...form, waterBodyType: e.target.value })}>
              <option value="">Тип водоёма</option>
              {Object.entries(WATER_BODY_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <label className="mw-admin-inline-form">
              <input type="checkbox" checked={form.relatedToMyWave} onChange={(e) => setForm({ ...form, relatedToMyWave: e.target.checked })} />
              <span className="mw-admin-caption">Связан с MyWave (нужны внешний эксперт и независимый редактор)</span>
            </label>
          </div>
          <div>
            <button type="button" className="mw-admin-btn" disabled={saving || !form.name.trim() || !form.region.trim()} onClick={() => void create()}>
              {saving ? "Сохраняем..." : "Создать спот"}
            </button>
          </div>
        </div>
      </AdminSectionCard>

      <CandidateImportCard onImported={load} />

      <MethodologyRegistryCard />

      <AdminSectionCard title="Реестр">
        <div className="mw-admin-inline-form" style={{ marginBottom: 12 }}>
          <span className="mw-admin-caption">Статус:</span>
          <select className="mw-admin-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все</option>
            {Object.entries(DISCOVERY_STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        {rows.length === 0 ? (
          <p className="mw-admin-caption">Спотов пока нет.</p>
        ) : (
          <div className="mw-admin-table-outer">
            <table className="mw-admin-table">
              <thead>
                <tr>
                  <th align="left">Спот</th>
                  <th align="left">Регион</th>
                  <th align="left">Статус</th>
                  <th align="left">Услуг</th>
                  <th align="left">Карта</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((spot) => (
                  <tr key={spot.id}>
                    <td>
                      <Link href={`/spots/${spot.id}`}>{spot.name}</Link>
                      {spot.relatedToMyWave ? <div className="mw-admin-caption">Связан с MyWave</div> : null}
                    </td>
                    <td>{spot.region}</td>
                    <td>
                      <AdminStatusBadge tone={spot.discoveryStatus === "listed" ? "ok" : "muted"}>
                        {DISCOVERY_STATUS_LABEL[spot.discoveryStatus] ?? spot.discoveryStatus}
                      </AdminStatusBadge>
                    </td>
                    <td>{spot._count?.serviceUnits ?? 0}</td>
                    <td>
                      {spot.latitude != null && spot.longitude != null ? (
                        <a href={yandexMapsUrl(spot.latitude, spot.longitude)} target="_blank" rel="noreferrer">Яндекс Карты</a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>
    </main>
  );
}
